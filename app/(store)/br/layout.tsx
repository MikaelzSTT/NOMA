import { Footer } from "@/components/footer";
import { Header } from "@/components/header";

export default function BrStoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header market="BR" />
      <main className="flex-1">{children}</main>
      <Footer market="BR" />
    </>
  );
}
