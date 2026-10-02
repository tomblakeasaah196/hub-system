/**
 * EnquiryDetailModal — full conversation view for a storefront enquiry.
 *
 * The enquiry list only shows the original message. Once we reply, the
 * reply is dispatched out through SmatComm to the customer's inbox and
 * written into a shared.message_channels thread keyed by their email —
 * but the list has nowhere to show it, so staff can't review what was
 * sent, let alone follow up.
 *
 * This modal fetches that thread (GET /campaigns/enquiries/:id → enquiry
 * + messages + attachments) and renders the full conversation
 * chronologically: the original enquiry as the first bubble, every staff
 * reply after it, each with its attachments. A composer at the bottom
 * lets staff send a follow-up message and attach documents, which flow
 * through the same reply endpoint (and the same SMTP dispatch).
 */
import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, Phone, Paperclip, Send, FileText, X } from "lucide-react";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { Badge } from "@components/ui/Badge";
import { showToast } from "@hooks/useToast";
import { useBusinessStore } from "@stores/useBusinessStore";
import {
  uploadMessageAttachment,
  fetchAttachmentBlobUrl,
} from "@services/messaging";
import {
  getEnquiry,
  replyToEnquiry,
  setEnquiryStatus,
  type Enquiry,
  type EnquiryStatus,
  type EnquiryThreadMessage,
  type EnquiryAttachment,
} from "@services/campaigns/campaigns";

const STATUS_FLOW: EnquiryStatus[] = ["new", "read", "replied", "closed"];
const STATUS_TONE: Record<EnquiryStatus, "gold" | "info" | "sage" | "neutral"> =
  {
    new: "gold",
    read: "info",
    replied: "sage",
    closed: "neutral",
  };

interface PendingAttachment {
  document_id: string;
  display_name: string;
}

export function EnquiryDetailModal({
  enquiryId,
  initial,
  open,
  onClose,
}: {
  enquiryId: string | null;
  initial?: Enquiry;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const activeBusiness = useBusinessStore((s) => s.active);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [reply, setReply] = useState("");
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["campaigns", "enquiries", enquiryId, "detail"],
    queryFn: () => getEnquiry(enquiryId as string),
    enabled: open && !!enquiryId,
  });

  const enquiry = data?.enquiry ?? initial;
  const messages: EnquiryThreadMessage[] = data?.messages ?? [];

  const replyMutation = useMutation({
    mutationFn: () =>
      replyToEnquiry(enquiryId as string, reply.trim(), pending),
    onSuccess: () => {
      showToast.success(
        "Reply sent",
        enquiry ? `Delivered to ${enquiry.email}` : undefined,
      );
      setReply("");
      setPending([]);
      qc.invalidateQueries({
        queryKey: ["campaigns", "enquiries", enquiryId, "detail"],
      });
      qc.invalidateQueries({ queryKey: ["campaigns", "enquiries"] });
    },
    onError: () => showToast.error("Could not send reply"),
  });

  const statusMutation = useMutation({
    mutationFn: (next: EnquiryStatus) =>
      setEnquiryStatus(enquiryId as string, next),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["campaigns", "enquiries", enquiryId, "detail"],
      });
      qc.invalidateQueries({ queryKey: ["campaigns", "enquiries"] });
    },
    onError: () => showToast.error("Could not update status"),
  });

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setUploading(true);
    try {
      const next: PendingAttachment[] = [];
      for (const file of Array.from(files)) {
        const att = await uploadMessageAttachment(
          file,
          activeBusiness || "diffusers",
        );
        next.push(att);
      }
      setPending((prev) => [...prev, ...next]);
    } catch {
      showToast.error("Could not upload attachment");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removePending(documentId: string) {
    setPending((prev) => prev.filter((p) => p.document_id !== documentId));
  }

  const canSend =
    !!enquiryId &&
    (reply.trim().length > 0 || pending.length > 0) &&
    !replyMutation.isPending &&
    !uploading;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      surface="dark"
      title={enquiry ? enquiry.name : "Enquiry"}
      description={enquiry ? enquiry.type : undefined}
    >
      {!enquiry || isLoading ? (
        <p className="text-sm text-brand-smoke py-12 text-center">Loading…</p>
      ) : (
        <div className="space-y-5">
          {/* Enquirer meta */}
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-white/5 bg-brand-graphite/30 p-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Badge tone={STATUS_TONE[enquiry.status]}>
                  {enquiry.status}
                </Badge>
                <span className="text-[0.65rem] uppercase tracking-widest text-brand-smoke">
                  {enquiry.type}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-brand-smoke">
                <a
                  href={`mailto:${enquiry.email}`}
                  className="flex items-center gap-1 hover:text-brand-accent"
                >
                  <Mail className="h-3 w-3" /> {enquiry.email}
                </a>
                <a
                  href={`tel:${enquiry.phone}`}
                  className="flex items-center gap-1 hover:text-brand-accent"
                >
                  <Phone className="h-3 w-3" /> {enquiry.phone}
                </a>
                <span className="tabular-nums">
                  Received {new Date(enquiry.created_at).toLocaleString()}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_FLOW.filter((s) => s !== enquiry.status).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={statusMutation.isPending}
                  onClick={() => statusMutation.mutate(s)}
                  className="rounded-full border border-white/10 px-2.5 py-1 text-[0.7rem] capitalize text-brand-smoke hover:border-brand-accent/40 hover:text-brand-accent transition-all disabled:opacity-50"
                >
                  Mark {s}
                </button>
              ))}
            </div>
          </div>

          {/* Conversation */}
          <div className="space-y-3">
            <p className="text-[0.65rem] uppercase tracking-widest text-brand-smoke">
              Conversation
            </p>

            {/* Original enquiry message */}
            <MessageBubble
              side="incoming"
              senderName={enquiry.name}
              createdAt={enquiry.created_at}
              content={enquiry.message}
              attachments={[]}
              label="Original enquiry"
            />

            {messages.length === 0 ? (
              <p className="text-xs text-brand-smoke pl-1">
                No replies sent yet.
              </p>
            ) : (
              messages.map((m) => (
                <MessageBubble
                  key={m.message_id}
                  side={m.sender_kind === "customer" ? "incoming" : "outgoing"}
                  senderName={
                    m.sender_name ||
                    (m.sender_kind === "staff" ? "Staff" : enquiry.name)
                  }
                  createdAt={m.created_at}
                  content={m.content}
                  attachments={m.attachments}
                  isDeleted={m.is_deleted}
                />
              ))
            )}
          </div>

          {/* Composer */}
          <div className="rounded-2xl border border-white/10 bg-brand-graphite/40 p-3 space-y-2">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={3}
              placeholder={`Write a follow-up to ${enquiry.name}…`}
              className="w-full resize-none rounded-xl border border-white/5 bg-brand-charcoal/60 px-3 py-2 text-sm text-brand-cream placeholder:text-brand-smoke/60 focus:border-brand-accent/40 focus:outline-none"
            />
            {pending.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {pending.map((att) => (
                  <span
                    key={att.document_id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-brand-accent/30 bg-brand-accent/10 px-2.5 py-1 text-xs text-brand-cream"
                  >
                    <FileText className="h-3 w-3" />
                    <span className="max-w-[12rem] truncate">
                      {att.display_name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removePending(att.document_id)}
                      className="text-brand-smoke hover:text-brand-cream"
                      aria-label="Remove attachment"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between">
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  hidden
                  onChange={(e) => handleFiles(e.target.files)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  {uploading ? "Uploading…" : "Attach"}
                </Button>
              </div>
              <Button
                size="sm"
                loading={replyMutation.isPending}
                disabled={!canSend}
                onClick={() => replyMutation.mutate()}
              >
                <Send className="h-3.5 w-3.5" />
                Send Follow-up
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Bubble ──────────────────────────────────────────────────────────────

function MessageBubble({
  side,
  senderName,
  createdAt,
  content,
  attachments,
  isDeleted,
  label,
}: {
  side: "incoming" | "outgoing";
  senderName: string;
  createdAt: string;
  content: string | null;
  attachments: EnquiryAttachment[];
  isDeleted?: boolean;
  label?: string;
}) {
  const outgoing = side === "outgoing";
  return (
    <div className={`flex ${outgoing ? "justify-end" : "justify-start"}`}>
      <div
        className={
          "max-w-[85%] rounded-2xl px-3.5 py-2.5 " +
          (outgoing
            ? "bg-brand-accent/15 border border-brand-accent/30"
            : "bg-brand-charcoal border border-white/5")
        }
      >
        <div className="flex items-baseline justify-between gap-3 mb-1">
          <span className="text-[0.7rem] font-medium text-brand-cream">
            {senderName}
          </span>
          <span className="text-[0.65rem] text-brand-smoke tabular-nums">
            {label ? `${label} · ` : ""}
            {new Date(createdAt).toLocaleString()}
          </span>
        </div>
        {isDeleted ? (
          <p className="text-xs italic text-brand-smoke">
            This message was deleted.
          </p>
        ) : content ? (
          <p className="whitespace-pre-wrap text-sm text-brand-cloud/95">
            {content}
          </p>
        ) : null}
        {attachments.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {attachments.map((att) => (
              <AttachmentChip key={att.document_id} attachment={att} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AttachmentChip({ attachment }: { attachment: EnquiryAttachment }) {
  const [busy, setBusy] = useState(false);
  async function download() {
    if (busy) return;
    setBusy(true);
    try {
      const url = await fetchAttachmentBlobUrl(attachment.document_id);
      const a = document.createElement("a");
      a.href = url;
      a.download = attachment.display_name ?? "attachment";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      showToast.error("Could not download attachment");
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={download}
      className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-brand-charcoal/60 px-2.5 py-1.5 text-left text-xs text-brand-cream hover:border-brand-accent/40 transition-colors"
    >
      <FileText className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 truncate">
        {attachment.display_name ?? "Attachment"}
      </span>
      <span className={busy ? "text-brand-smoke animate-pulse" : "text-brand-smoke"}>
        Download
      </span>
    </button>
  );
}
