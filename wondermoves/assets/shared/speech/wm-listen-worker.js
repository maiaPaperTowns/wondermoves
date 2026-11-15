/* ==========================================================================
   Offline speech-to-text for "Pip, ..." voice commands.
   Runs Whisper (tiny, English) in a background worker, entirely in the browser:
   no internet, no account, nothing recorded or kept. Audio in, text out.

   Whisper is given a short hint of the words children will say (Pip, exit, begin, again...),
   the way a person listens better when they know the topic. Without it, tiny Whisper drops
   "Pip" and mishears single-word commands.

   messages in : { type: 'load' }                           load the model (~40 MB, from this folder)
                 { type: 'hear', id, audio: Float32Array }  16 kHz mono speech
   messages out: { type: 'ready' } | { type: 'error', message }
                 { type: 'text', id, text, ms }
   Files: lib/ (transformers.js 4.3.2 + onnxruntime wasm), models/whisper-tiny.en/
   ========================================================================== */
import { AutoProcessor, WhisperForConditionalGeneration, env } from './lib/transformers.min.js';

env.allowRemoteModels = false;              // never download: everything is local
env.allowLocalModels = true;
// Must be a path, not a full http:// address: transformers.js 4 only treats paths as local files.
env.localModelPath = new URL('./models/', import.meta.url).pathname;
env.useBrowserCache = false;
env.backends.onnx.wasm.wasmPaths = new URL('./lib/', import.meta.url).href;
env.backends.onnx.wasm.numThreads = 1;      // works without special server headers

const HINT = ' Pip, exit. Pip, begin. Start. Next. Again. Pause. Help. Yes. No. Open fossil. Treasure. Bubbles.';
let proc = null, model = null, prefix = null, NOTS = 0;

async function load() {
  proc = await AutoProcessor.from_pretrained('whisper-tiny.en');
  model = await WhisperForConditionalGeneration.from_pretrained('whisper-tiny.en', {
    dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' }, device: 'wasm',
  });
  const tok = proc.tokenizer;
  const [PREV, SOT, NT] = tok.convert_tokens_to_ids(['<|startofprev|>', '<|startoftranscript|>', '<|notimestamps|>']);
  NOTS = NT;
  prefix = [PREV, ...tok.encode(HINT, { add_special_tokens: false }), SOT, NT];
  await transcribe(new Float32Array(16000));            // warm up so the first command is fast
}

async function transcribe(audio) {
  const inputs = await proc(audio);
  const ids = await model.generate({ ...inputs, decoder_input_ids: [prefix], max_new_tokens: 32 });
  const all = ids.tolist()[0].map(Number);
  return proc.tokenizer.decode(all.slice(all.lastIndexOf(NOTS) + 1), { skip_special_tokens: true }).trim();
}

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'load') {
      if (!model) await load();
      self.postMessage({ type: 'ready' });
    } else if (m.type === 'hear') {
      if (!model) await load();
      const t0 = performance.now();
      const text = await transcribe(m.audio);
      self.postMessage({ type: 'text', id: m.id, text, ms: Math.round(performance.now() - t0) });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: m.id, message: String(err && err.message || err) });
  }
};
