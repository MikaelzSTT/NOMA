import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  revalidatePath: vi.fn(),
  db: {
    assistedPurchaseRequest: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import AdminAssistedPurchasesPage from "@/app/admin/(dashboard)/atendimentos/page";
import { updateAssistedPurchaseStatusAction } from "@/app/admin/(dashboard)/atendimentos/actions";

describe("admin de atendimentos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ email: "admin@example.com" });
    mocks.db.assistedPurchaseRequest.findMany.mockResolvedValue([]);
    mocks.db.assistedPurchaseRequest.update.mockResolvedValue({ id: "request-1", status: "CONTACTED" });
  });

  it("protege a página antes de consultar dados pessoais", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(AdminAssistedPurchasesPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.db.assistedPurchaseRequest.findMany).not.toHaveBeenCalled();
  });

  it("altera o status após validar a sessão administrativa", async () => {
    const formData = new FormData();
    formData.set("id", "request-1");
    formData.set("status", "CONTACTED");

    await updateAssistedPurchaseStatusAction(formData);

    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(mocks.db.assistedPurchaseRequest.update).toHaveBeenCalledWith({
      where: { id: "request-1" },
      data: { status: "CONTACTED" },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/atendimentos");
  });
});
