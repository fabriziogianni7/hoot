import { minikitConfig } from "../../../minikit.config";

export async function GET() {
  // return Response.json(withValidManifest(minikitConfig));
  return Response.json(minikitConfig);
}
