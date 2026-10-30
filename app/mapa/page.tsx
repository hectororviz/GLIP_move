import FloorMap from "@/components/FloorMap";

export default function MapaPage({ searchParams }: { searchParams: { calibrar?: string; focus?: string; floor?: string } }) {
  return <FloorMap calibrar={searchParams.calibrar === "1"} focus={searchParams.focus || null} floorParam={searchParams.floor || null} />;
}
