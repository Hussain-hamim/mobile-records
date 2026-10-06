import { copyFile } from "node:fs/promises";

await copyFile("dist/record/[id].html", "dist/record/view.html");
await copyFile("dist/customer/[id].html", "dist/customer/view.html");
