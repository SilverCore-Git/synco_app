import VectorWorker from '@/workers/vector.worker?worker';

// Create a single global worker instance
const globalVectorWorker = new VectorWorker();

export default globalVectorWorker;
