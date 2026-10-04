// Cancel CPU work as well as its promises. A stale search must not delay the next plane.
export class WorkerClient {
  constructor(createWorker) {
    this.createWorker = createWorker;
    this.worker = null;
    this.nextId = 0;
    this.pending = new Map();
  }

  request(type, args, onProgress = () => {}) {
    if (!this.worker) this.connect();
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      this.pending.set(id, { resolve, reject, onProgress });
      try { this.worker.postMessage({ id, type, ...args }); }
      catch (error) { this.pending.delete(id); reject(error); }
    });
  }

  connect() {
    const worker = this.worker = this.createWorker();
    worker.onmessage = ({ data }) => {
      const p = this.pending.get(data.id);
      if (!p) return;
      if ("progress" in data) p.onProgress(data.progress);
      else {
        this.pending.delete(data.id);
        if (data.error) p.reject(new Error(data.error));
        else p.resolve(data.result);
      }
    };
    worker.onerror = (event) => {
      event.preventDefault?.();
      this.stop(new Error(event.message || "Analysis worker failed"));
    };
  }

  stop(error = Object.assign(new Error("Analysis cancelled"), { name: "AbortError" })) {
    this.worker?.terminate();
    this.worker = null;
    for (const p of this.pending.values()) p.reject(error);
    this.pending.clear();
  }
}
