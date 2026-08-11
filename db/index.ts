// Aether currently keeps journeys on the user's device.
// The Vercel production database will be connected after the account model is confirmed.
export function getDb(): never {
  throw new Error("Aether 的云端数据库尚未配置。");
}
