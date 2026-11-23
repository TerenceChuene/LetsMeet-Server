let ioInstance = null;

export function setIO(io) {
  ioInstance = io;
}

export function getIO() {
  return ioInstance;
}

export function requireIO() {
  if (!ioInstance) {
    throw new Error('Socket.IO has not been initialised');
  }
  return ioInstance;
}
