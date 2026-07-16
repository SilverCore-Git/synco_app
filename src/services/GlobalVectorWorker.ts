import VectorWorker from '../workers/vector.worker.ts?worker';

// Create a single global worker instance
const globalVectorWorker = new VectorWorker();

globalVectorWorker.addEventListener('error', (e: any) => {
    console.error("[GlobalVectorWorker] Worker global error event:", e);
});

export default globalVectorWorker;
