import { swuSyncSource } from "../src/lib/swu/sync";
async function main(){
  const logs: string[] = [];
  const cards = await swuSyncSource.fetchCards(swuSyncSource.defaultUrl, (m)=>{ logs.push(m); }, "en");
  console.log("total cards:", cards.length);
  console.log("requests made:", logs.filter(l=>l.startsWith("Fetched page")).length);
  console.log("first log:", logs[1]);
  console.log("last log :", logs[logs.length-2]);
  const ids = new Set(cards.map(c=>c.id));
  console.log("unique ids:", ids.size, "| blank ids:", cards.filter(c=>!c.id).length);
  console.log("with images:", cards.filter(c=>c.imageUrl).length);
}
main();
