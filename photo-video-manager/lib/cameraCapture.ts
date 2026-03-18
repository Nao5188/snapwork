type ActionCallback = () => void;
type RecordingListener = (isRecording: boolean) => void;

let _action: ActionCallback | null = null;
let _isRecording = false;
let _listeners: RecordingListener[] = [];

export const cameraCaptureService = {
  register(fn: ActionCallback) {
    _action = fn;
  },
  unregister() {
    _action = null;
  },
  trigger() {
    _action?.();
  },
  setRecording(r: boolean) {
    _isRecording = r;
    _listeners.forEach(l => l(r));
  },
  subscribeRecording(fn: RecordingListener) {
    _listeners.push(fn);
    return () => {
      _listeners = _listeners.filter(l => l !== fn);
    };
  },
  get isRecording() {
    return _isRecording;
  },
};
