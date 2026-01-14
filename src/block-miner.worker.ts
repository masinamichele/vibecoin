import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { hash as _hash } from 'node:crypto';

if (!isMainThread) {
  const { difficulty, timestamp, root, previousHash, startNonce, endNonce } = workerData;

  const generateHash = (nonce: number) => {
    const key = `${timestamp}-${root}-${previousHash}-${nonce}`;
    return _hash('sha256', key);
  };

  const isValid = (hash: string) => hash.substring(0, difficulty) === '0'.repeat(difficulty);

  for (let nonce = startNonce; nonce < endNonce; nonce++) {
    const hash = generateHash(nonce);
    if (isValid(hash)) {
      parentPort.postMessage({ success: true, nonce, hash });
      break;
    }
  }
  parentPort.postMessage({ success: false, nonce: null, hash: null });
}
