import {
  importDatabaseFromAssetAsync,
  openDatabaseAsync,
  type SQLiteDatabase,
} from "expo-sqlite";
let database: Promise<SQLiteDatabase> | undefined;
export async function lookupTac(
  imei: string,
): Promise<{ brand: string; model: string } | null> {
  database ??= (async () => {
    await importDatabaseFromAssetAsync("tac-v1.db", {
      assetId: require("../../assets/data/tac.db"),
    });
    return openDatabaseAsync("tac-v1.db");
  })();
  return (await database).getFirstAsync(
    "SELECT brand,model FROM tac WHERE tac=?",
    imei.slice(0, 8),
  );
}
