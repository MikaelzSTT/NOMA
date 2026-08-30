import { Footer } from "@/components/footer";
import { Header } from "@/components/header";

export default function UsStoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header market="US" />
      <main className="flex-1">{children}</main>
      <Footer market="US" />
    </>
  );
}
