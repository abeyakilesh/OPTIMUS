import Nav from "@/components/landing/Nav";
import Hero from "@/components/landing/Hero";
import Features from "@/components/landing/Features";
import Kernel from "@/components/landing/Kernel";
import Loop from "@/components/landing/Loop";
import Stats from "@/components/landing/Stats";
import Platforms from "@/components/landing/Platforms";
import Testimonials from "@/components/landing/Testimonials";
import CTA from "@/components/landing/CTA";
import Footer from "@/components/landing/Footer";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        {/* what you get → what's underneath → how it runs → the receipts */}
        <Features />
        <Kernel />
        <Loop />
        <Stats />
        <Platforms />
        <Testimonials />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
