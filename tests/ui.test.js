// Browser-adapter smoke checks. These catch wiring/flow errors, not pixel or usability regressions.
import test from "node:test";
import assert from "node:assert/strict";
import { createBoardingView } from "../src/view/boarding-view.js";
import { PlaneLayout, PLANES } from "../src/sim/layout.js";
import { BoardingPlan } from "../src/sim/plan.js";
import { BoardingSim } from "../src/sim/boarding.js";

function canvasContext() {
  return new Proxy({}, { get(target, key) {
    return target[key] ?? ((...args) => {
      for (const value of args) if (typeof value === "number") assert.ok(Number.isFinite(value), `${String(key)} received a nonfinite coordinate`);
    });
  }, set(target, key, value) { target[key] = value; return true; } });
}

class Element {
  constructor(id) {
    this.id = id; this.children = []; this.style = {}; this.listeners = new Map();
    this.value = ""; this.textContent = ""; this.disabled = false;
  }
  set innerHTML(value) { this.html = value; this.children = []; }
  get innerHTML() { return this.html; }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.append(child); }
  querySelectorAll(tag) { return this.children.filter((c) => c.id === tag); }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  dispatch(type, props = {}) { this.listeners.get(type)?.(props); }
  getBoundingClientRect() { return {left:0, top:0, width:this.width, height:this.height}; }
  getContext() { return this.ctx ??= canvasContext(); }
  setPointerCapture() {}
}

function makeCanvas() { return Object.assign(new Element("c"), {width:1080, height:470}); }

test("canvas adapter renders finite geometry for every plane without changing the sim", () => {
  for (const config of Object.values(PLANES)) {
    const layout = new PlaneLayout(config.rows, config.blocks);
    const plan = new BoardingPlan(layout, config.maxZones), sim = new BoardingSim(layout, plan, 1);
    const view = createBoardingView(makeCanvas()); view.configure(layout);
    view.capture(sim, 0, 50, true);
    sim.releaseZone(0);
    for (let i = 0; i < 30; i++) sim.step();
    const before = JSON.stringify(sim);
    view.draw({sim,plan,mouse:null,planeName:config.name,now:50,tickDuration:50});
    assert.equal(JSON.stringify(sim), before, "drawing does not modify the model");
  }
});

test("UI flow: painting stops at start, flight pays once, retry works, and upgrade persists", async () => {
  const elements = new Map();
  const canvas = makeCanvas(); elements.set("c",canvas);
  const document = { getElementById(id) {
    if (!elements.has(id)) elements.set(id,new Element(id));
    return elements.get(id);
  }, createElement(tag) { return new Element(tag); } };
  let stored = JSON.stringify({money:30, autoCall:false});
  const localStorage = {getItem() { return stored; },setItem(key,value) { stored = value; }};
  let nextFrame;
  const originals = { document:globalThis.document, localStorage:globalThis.localStorage, requestAnimationFrame:globalThis.requestAnimationFrame };
  Object.assign(globalThis,{document,localStorage,requestAnimationFrame(fn) { nextFrame = fn; }});
  try {
    await import(`../src/main.js?ui-smoke=${Date.now()}`);
    let time = 1;
    const frame = () => { time += 100; nextFrame(time); };
    frame();
    const get = id => document.getElementById(id);
    assert.ok(get("status").textContent.includes("Paint zones"));
    // First tier geometry: row 0, left seat. Pointer begins a drag painting zone 2.
    canvas.dispatch("pointerdown",{clientX:494,clientY:201,pointerId:1});
    const calls = () => get("callBar").children.filter(c=>c.id==="button");
    assert.equal(calls().length,2);
    calls()[0].onclick();
    const zoneCount = calls().length;
    canvas.dispatch("pointermove",{clientX:538,clientY:201});
    assert.equal(calls().length,zoneCount);
    assert.ok(calls()[0].disabled,"drag cannot rebuild a running flight");
    assert.ok(get("autoBar").children[0].disabled,"no purchase mid-flight");
    calls()[1].onclick(); get("speed").value="10";
    for(let i=0;i<100&&!get("status").textContent.includes("Earned");i++) frame();
    assert.ok(get("status").textContent.includes("Earned"));
    const paid = JSON.parse(stored).money;
    assert.ok(paid>30);
    for(let i=0;i<10;i++) frame();
    assert.equal(JSON.parse(stored).money,paid,"a completed flight pays only once per attempt");
    get("retry").onclick(); frame();
    assert.ok(get("status").textContent.includes("Paint zones"));
    get("autoBar").children[0].onclick();
    assert.equal(JSON.parse(stored).money,paid-30);
    assert.equal(JSON.parse(stored).autoOn,true);
    assert.equal(get("go").style.display,"");
    get("go").onclick();
    for(let i=0;i<100&&!get("status").textContent.includes("Earned");i++) frame();
    assert.ok(get("status").textContent.includes("Earned"));
  } finally {
    for (const [key,value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});

test("stats adapter runs analysis/search/refinement and cancels stale requests", async () => {
  const originalKeys = ["document","Worker","location","window","self"];
  const originals = Object.fromEntries(originalKeys.map(key=>[key,globalThis[key]]));
  const elements = new Map();
  const canvas = makeCanvas(); elements.set("c",canvas);
  Element.prototype.insertRow = function() { const row = new Element("tr");this.append(row);return row; };
  Element.prototype.insertCell = function() { const cell = new Element("td");this.append(cell);return cell; };
  const document = {getElementById(id) {
    if(!elements.has(id)) elements.set(id,new Element(id));return elements.get(id);
  },createElement(tag) { const element=new Element(tag); if(tag==="canvas") Object.assign(element,{width:0,height:0});return element; }};
  const get = id=>document.getElementById(id);
  get("rows").value="12";get("blocks").value="1-1";get("zones").value="2";get("n").value="100";
  let handler;
  const workers=[];
  class MockWorker {
    constructor() { workers.push(this); }
    postMessage(data) {
      queueMicrotask(()=> {
        if(this.terminated)return;
        const prior=globalThis.self;
        globalThis.self={postMessage: message=>this.onmessage?.({data:message})};
        try { handler({data}); } finally { globalThis.self=prior; }
      });
    }
    terminate() {this.terminated=true;}
  }
  Object.assign(globalThis,{document,Worker:MockWorker,location:{hash:"#p=tier1&z="+"01".repeat(12)},window:{addEventListener(){}},self:{}});
  const settle=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
  try {
    await import(`../src/stats-worker.js?stats-smoke=${Date.now()}`);
    handler=globalThis.self.onmessage;
    await import(`../src/stats-main.js?stats-smoke=${Date.now()}`);
    await settle();
    assert.equal(get("note").textContent,"");
    assert.ok(get("t").children.length>=3);
    assert.ok(get("policy").textContent.includes("1 → 2"));
    await get("search").onclick();
    assert.ok(get("note").textContent.includes("training seeds"));
    await get("refine").onclick();
    assert.ok(get("note").textContent.includes("Refinement"));
    // Cancel a queued search before it executes and start a different cabin.
    const stale = get("search").onclick();
    get("preset").value="tier2";get("preset").onchange();
    await stale;await settle();
    assert.ok(workers[0].terminated);
    assert.equal(get("note").textContent,"");
    assert.ok(get("policy").textContent.includes("1 → 2 → 3"));
    const rowsBefore=get("t").children.length;
    get("n").value="100";get("n").onchange();await settle();
    assert.equal(get("t").children.length,rowsBefore);
    assert.ok(!get("search").disabled);
  } finally {
    for(const [key,value] of Object.entries(originals)) {
      if(value===undefined)delete globalThis[key];else globalThis[key]=value;
    }
  }
});
