// Free, local image comparison: a small open-source MobileNet model runs in the
// browser and turns each photo into a numeric fingerprint. No paid AI service.
// The library is loaded on demand so it never weighs on the rest of the app.

export const EMBEDDING_MODEL = "mobilenet_v1_050_gap";
const MODEL_URL = "https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.50_224/model.json";

type Loaded = {
  tf: typeof import("@tensorflow/tfjs");
  model: import("@tensorflow/tfjs").LayersModel;
};

let loading: Promise<Loaded> | null = null;

export function loadVisualModel(): Promise<Loaded> {
  if (!loading) {
    loading = (async () => {
      const tf = await import("@tensorflow/tfjs");
      await tf.ready();
      const base = await tf.loadLayersModel(MODEL_URL);
      const features = base.getLayer("global_average_pooling2d_1");
      const model = tf.model({ inputs: base.inputs, outputs: features.output });
      return { tf, model };
    })();
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

/** Returns an L2-normalised fingerprint of the photo (center square crop). */
export async function computeEmbedding(source: HTMLCanvasElement): Promise<number[]> {
  const { tf, model } = await loadVisualModel();
  const output = tf.tidy(() => {
    const img = tf.browser.fromPixels(source).toFloat();
    const [h, w] = img.shape;
    const side = Math.min(h, w);
    const cropped = img.slice([Math.floor((h - side) / 2), Math.floor((w - side) / 2), 0], [side, side, 3]);
    const resized = tf.image.resizeBilinear(cropped as import("@tensorflow/tfjs").Tensor3D, [224, 224]);
    const input = resized.div(127.5).sub(1).expandDims(0);
    return (model.predict(input) as import("@tensorflow/tfjs").Tensor).flatten();
  });
  const values = Array.from(await output.data());
  output.dispose();
  const norm = Math.sqrt(values.reduce((s, v) => s + v * v, 0)) || 1;
  return values.map((v) => Math.round((v / norm) * 1e5) / 1e5);
}
