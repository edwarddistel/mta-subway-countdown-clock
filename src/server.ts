import express from "express";
import cors from "cors";
import { getMtaData } from "./mta";

const app = express();
const port = 4000;
app.use(cors());

const server = app.listen(port, async () => {
  console.log(`MTA Countdown API live on ${port}`);
});

app.get("/", async (req: express.Request, res: express.Response) =>
  res.send(await getMtaData())
);
