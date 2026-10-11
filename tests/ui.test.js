// Browser-adapter smoke test; mocked Canvas/DOM does not establish visual correctness.
import test from "node:test";
import assert from "node:assert/strict";

class Element {
  constructor(tag) {
    this.tag = tag; this.children = []; this.style = {}; this.listeners = new Map();
    this.attributes = new Map(); this.classes = new Set(); this.value = ""; this.textContent = "";
    this.classList = {toggle: (name,on) => {if (on) this.classes.add(name); else this.classes.delete(name);}};
  }
  set innerHTML(value) {this.html=value;this.children=[];}
  get innerHTML() {return this.html;}
  append(...children) {this.children.push(...children);}
  setAttribute(name,value) {this.attributes.set(name,value);}
  addEventListener(type,handler) {this.listeners.set(type,handler);}
  getContext() {return new Proxy({}, {get:()=> (...args)=> {
    for (const arg of args) if (typeof arg === "number") assert.ok(Number.isFinite(arg));
  }});}
  getBoundingClientRect() {return {left:0,top:0,width:this.width,height:this.height};}
  setPointerCapture() {}
}

test("UI covers zone timing, reviews, retry comparison, manual help and persisted delegation", async () => {
  const keys=["document","localStorage","requestAnimationFrame"];
  const originals=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
  const nodes = new Map();
  const document = {getElementById(id) {
    if (!nodes.has(id)) nodes.set(id,new Element(id));return nodes.get(id);
  },createElement(tag) {return new Element(tag);}};
  const $ = id=>document.getElementById(id);
  Object.assign($("c"),{width:1080,height:470});
  let stored=JSON.stringify({money:30,autoCall:false}), nextFrame;
  Object.assign(globalThis,{document,localStorage:{getItem:()=>stored,setItem:(key,value)=>{stored=value;}},
    requestAnimationFrame:fn=>{nextFrame=fn;}});
  try {
    await import(`../src/main.js?timing-test=${Date.now()}`);
    let time=1;
    const frame=()=>{time+=100;nextFrame(time);};
    frame();
    $("plane").value="tier2";$("plane").onchange();
    $("speed").value="10";
    // Paint the top window seat row into zone 2; the rest remains zone 1.
    // Tier 2 geometry has cell 44, top slot y=157, first seat x=494.
    for (let row=0;row<12;row++) {
      $("c").listeners.get("pointerdown")({clientX:494+44*row,clientY:157,pointerId:1});
      $("c").listeners.get("pointerup")({});
    }
    const calls=()=>$("zoneRows").children.map(row=>row.children[3]);
    assert.ok(!calls()[1].disabled);
    calls()[0].onclick();calls()[1].onclick();frame();
    assert.ok($("lineHint").textContent.includes("Mixed line"));
    assert.ok($("gateLine").classes.has("mixed"));
    assert.ok($("linePreview").attributes.get("aria-label").includes("zone 2, zone 1"));
    assert.ok($("upgradeBox").children[0].disabled);
    for(let i=0;i<200&&!$("status").textContent.includes("Earned");i++)frame();
    assert.ok($("status").textContent.includes("Earned"));
    assert.ok($("lineHint").textContent.includes("1 overlapping call"));
    assert.equal($("review").hidden, false);
    assert.ok($("reviewSummary").textContent.includes("Mood"));
    assert.ok($("worstJam").textContent.includes("Worst jam"));
    assert.ok($("complaints").children.length <= 3);
    $("retry").onclick();frame();
    assert.equal($("review").hidden, true);
    assert.ok($("lineHint").textContent.includes("Call next"));
    calls()[0].onclick();
    for(let i=0;i<200&&!$("lineHint").textContent.includes("Line clear");i++)frame();
    assert.ok($("lineHint").textContent.includes("Line clear"));
    assert.ok($("gateLine").classes.has("ready"));
    calls()[1].onclick();
    for(let i=0;i<200&&!$("status").textContent.includes("Earned");i++)frame();
    assert.ok($("status").textContent.includes("Earned"));
    assert.ok($("reviewComparison").textContent.includes("Previous attempt"));
    $("retry").onclick();
    $("upgradeBox").children[0].onclick();
    assert.equal(JSON.parse(stored).autoCall,true);
    assert.equal($("go").hidden,false);
    $("go").onclick();
    for(let i=0;i<200&&!$("status").textContent.includes("Earned");i++)frame();
    assert.ok($("status").textContent.includes("Earned"));
    assert.ok($("lineHint").textContent.includes("0 overlapping calls"));
    $("new").onclick(); frame(); $("go").onclick();
    for(let i=0;i<200&&!$("status").textContent.includes("Earned");i++)frame();
    assert.equal($("reviewComparison").textContent, "");
    // A fresh one-zone Tier 2 plan produces a real shuffle, with help before timeout.
    $("plane").value="tier2"; $("plane").onchange(); $("speed").value="2"; frame();
    $("go").onclick();
    for(let i=0;i<1000&&$("assistPanel").hidden;i++)frame();
    assert.equal($("assistPanel").hidden,false);
    assert.ok($("assistHint").textContent.includes("hesitates at row"));
    assert.equal($("assist").disabled,false);
    $("assist").onclick();
    assert.equal($("assistPanel").hidden,true);
    for(let i=0;i<1000&&!$("status").textContent.includes("Earned");i++)frame();
    assert.ok($("reviewAssist").textContent.includes("You helped"));
    $("retry").onclick();
    const helper = $("upgradeBox").children.find(e=>e.textContent.startsWith("Boarding helper:"));
    assert.equal(helper.disabled,false);
    const oldMoney = JSON.parse(stored).money;
    helper.onclick();
    assert.equal(JSON.parse(stored).shuffleStaff,true);
    assert.equal(JSON.parse(stored).autoCall,true);
    assert.equal(JSON.parse(stored).money,oldMoney-40);
    frame(); $("go").onclick();
    for(let i=0;i<1000&&!$("status").textContent.includes("Earned");i++) {
      frame(); assert.equal($("assistPanel").hidden,true);
    }
    assert.ok($("reviewAssist").textContent.includes("Boarding helper helped"));
    const moneyAfterFlight = JSON.parse(stored).money;
    await import(`../src/main.js?reload-test=${Date.now()}`);
    frame();
    assert.equal($("money").textContent, `$${moneyAfterFlight}`);
    assert.ok($("upgradeBox").children.some(e=>e.textContent === "✓ Boarding helper (owned)"));
    assert.equal($("go").hidden, false);
  } finally {
    for(const [key,value] of Object.entries(originals)) {
      if(value===undefined)delete globalThis[key];else globalThis[key]=value;
    }
  }
});
