declare module "*.worker.ts" {
    const WorkerConstructor: new () => Worker;
    export default WorkerConstructor;
}

declare const self: DedicatedWorkerGlobalScope;
