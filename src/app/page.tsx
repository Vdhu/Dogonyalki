'use client';

import dynamic from "next/dynamic";

const TagGameClient = dynamic(
  () => import("@/components/tag-game-client").then((m) => m.TagGameClient),
  { ssr: false }
);

export default function Page() {
  return <TagGameClient />;
}
