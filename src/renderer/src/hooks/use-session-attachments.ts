import { useCallback, useState } from "react";
import type {
  ChatSession,
  DesktopApi,
  SelectedFile,
} from "@shared/contracts";
import { mergeAttachments } from "@renderer/lib/session";

export function useSessionAttachments({
  activeSession,
  desktopApi,
  persistSession,
}: {
  activeSession: ChatSession | null;
  desktopApi: DesktopApi | undefined;
  persistSession: (session: ChatSession) => void;
}) {
  const [isPickingFiles, setIsPickingFiles] = useState(false);

  const enrichSelectedFiles = useCallback(
    async (files: SelectedFile[]) => {
      if (!desktopApi) {
        return files;
      }

      return Promise.all(
        files.map(async (file) => {
          if (file.kind !== "text") {
            return file;
          }

          const preview = await desktopApi.files.readPreview(file.path);
          return {
            ...file,
            previewText: preview.previewText,
            truncated: preview.truncated,
            error: preview.error,
          };
        }),
      );
    },
    [desktopApi],
  );

  const appendAttachmentsToSession = useCallback(
    async (files: SelectedFile[]) => {
      if (!activeSession || !desktopApi || files.length === 0) {
        return;
      }

      const enrichedFiles = await enrichSelectedFiles(files);
      const nextSession: ChatSession = {
        ...activeSession,
        attachments: mergeAttachments(activeSession.attachments, enrichedFiles),
        updatedAt: new Date().toISOString(),
      };

      persistSession(nextSession);
    },
    [activeSession, desktopApi, enrichSelectedFiles, persistSession],
  );

  const attachFiles = useCallback(async () => {
    if (!activeSession || !desktopApi) {
      return;
    }

    setIsPickingFiles(true);

    try {
      const pickedFiles = await desktopApi.files.pick();
      await appendAttachmentsToSession(pickedFiles);
    } finally {
      setIsPickingFiles(false);
    }
  }, [activeSession, appendAttachmentsToSession, desktopApi]);

  const pasteFiles = useCallback(
    async (files: File[]) => {
      if (!activeSession || !desktopApi || files.length === 0) {
        return;
      }

      setIsPickingFiles(true);

      try {
        const pastedFiles = await Promise.all(
          files.map(async (file) =>
            desktopApi.files.saveFromClipboard({
              name: file.name,
              mimeType: file.type,
              buffer: await file.arrayBuffer(),
            }),
          ),
        );

        await appendAttachmentsToSession(pastedFiles);
      } finally {
        setIsPickingFiles(false);
      }
    },
    [activeSession, appendAttachmentsToSession, desktopApi],
  );

  const removeAttachment = useCallback(
    (attachmentId: string) => {
      if (!activeSession) {
        return;
      }

      const nextSession: ChatSession = {
        ...activeSession,
        attachments: activeSession.attachments.filter(
          (attachment) => attachment.id !== attachmentId,
        ),
        updatedAt: new Date().toISOString(),
      };

      persistSession(nextSession);
    },
    [activeSession, persistSession],
  );

  return {
    isPickingFiles,
    attachFiles,
    pasteFiles,
    removeAttachment,
  };
}
