import { auth } from "@/lib/auth";
import { isAppError } from "@/lib/errors";
import { auditSubmissionService } from "@/services/audit-submission-service";
import { getStorageProvider } from "@/services/storage";

/**
 * Authenticated image delivery. Access is scoped exactly like submission
 * reads (Branch Managers: own branch only) — the service enforces it.
 * Route handler because binary responses need a real HTTP endpoint.
 */
export async function GET(_request: Request, context: { params: Promise<{ imageId: string }> }) {
  const session = await auth();
  const user = session?.user;
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { imageId } = await context.params;

  try {
    const image = await auditSubmissionService.getImage(
      { id: user.id, role: user.role, branchId: user.branchId ?? null },
      imageId
    );
    if (!image.storageKey) return new Response("Not found", { status: 404 });

    const object = await getStorageProvider().get(image.storageKey);
    if (!object) return new Response("Not found", { status: 404 });

    return new Response(new Uint8Array(object.data), {
      headers: {
        "Content-Type": object.contentType ?? image.mimeType ?? "application/octet-stream",
        "Content-Length": String(object.sizeBytes),
        // Private: images are access-controlled evidence; never shared caches.
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") {
      return new Response("Not found", { status: 404 });
    }
    throw error;
  }
}
