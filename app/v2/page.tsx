import { ScrollProgress, CursorGlow } from "@/components/landing-v2/fx";
import NavV2 from "@/components/landing-v2/NavV2";
import HeroV2 from "@/components/landing-v2/HeroV2";
import MarqueeV2 from "@/components/landing-v2/MarqueeV2";
import KernelV2 from "@/components/landing-v2/KernelV2";
import FeaturesV2 from "@/components/landing-v2/FeaturesV2";
import LoopV2 from "@/components/landing-v2/LoopV2";
import StatsV2 from "@/components/landing-v2/StatsV2";
import EvidenceV2 from "@/components/landing-v2/EvidenceV2";
import PlatformsV2 from "@/components/landing-v2/PlatformsV2";
import TestimonialsV2 from "@/components/landing-v2/TestimonialsV2";
import CTAV2 from "@/components/landing-v2/CTAV2";
import FooterV2 from "@/components/landing-v2/FooterV2";

export default function LandingV2() {
  return (
    <>
      <ScrollProgress />
      <CursorGlow />
      <NavV2 />
      <main className="relative z-10">
        <HeroV2 />
        <MarqueeV2 />
        <KernelV2 />
        <FeaturesV2 />
        <LoopV2 />
        <StatsV2 />
        <EvidenceV2 />
        <PlatformsV2 />
        <TestimonialsV2 />
        <CTAV2 />
      </main>
      <FooterV2 />
    </>
  );
}
