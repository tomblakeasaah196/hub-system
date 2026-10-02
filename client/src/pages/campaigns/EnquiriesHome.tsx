/**
 * EnquiriesHome — storefront enquiries inbox.
 * Route: /campaigns/enquiries
 * View partnership/wholesale/gifting enquiries submitted from the site,
 * filter by status, and open each one in a modal that shows the full
 * reply history and lets staff send a follow-up (with attachments).
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Mail, Phone, MessageSquare } from "lucide-react";
import { Topbar } from "@/components/shell/Topbar";
import { PageHeader } from "@components/ui/PageHeader";
import { Input } from "@components/ui/Input";
import { Badge } from "@components/ui/Badge";
import { EmptyState } from "@components/ui/EmptyState";
import { showToast } from "@hooks/useToast";
import {
  listEnquiries,
  setEnquiryStatus,
  type Enquiry,
  type EnquiryStatus,
} from "@services/campaigns/campaigns";
import { EnquiryDetailModal } from "./EnquiryDetailModal";

const WORD_LIMIT = 40;

const STATUS_FLOW: EnquiryStatus[] = ["new", "read", "replied", "closed"];
const STATUS_TONE: Record<EnquiryStatus, "gold" | "info" | "sage" | "neutral"> =
  {
    new: "gold",
    read: "info",
    replied: "sage",
    closed: "neutral",
  };

export default function EnquiriesHome() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<EnquiryStatus | "">("");
  const [openEnquiry, setOpenEnquiry] = useState<Enquiry | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["campaigns", "enquiries", search, status],
    queryFn: () =>
      listEnquiries({
        search: search || undefined,
        status: (status || undefined) as EnquiryStatus | undefined,
      }),
  });

  const mutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: EnquiryStatus }) =>
      setEnquiryStatus(id, next),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns", "enquiries"] });
    },
    onError: () => showToast.error("Could not update status"),
  });

  const enquiries = data?.data ?? [];
  const counts = data?.counts ?? { total: 0, new: 0, replied: 0, closed: 0 };

  return (
    <>
      <Topbar title="Enquiries" subtitle="Marketing · Storefront" />
      <div className="px-4 sm:px-8 py-6 max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Storefront Enquiries"
          subtitle="Partnership, wholesale, gifting and general enquiries submitted from the site."
          crumbs={[
            { label: "Hub", to: "/" },
            { label: "Campaigns", to: "/campaigns" },
            { label: "Enquiries" },
          ]}
        />

        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total", value: counts.total, color: "#9E9891" },
            { label: "New", value: counts.new, color: "#C9A86C" },
            { label: "Replied", value: counts.replied, color: "#2D6A4F" },
            { label: "Closed", value: counts.closed, color: "#9E9891" },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-2xl border border-white/5 bg-brand-charcoal px-4 py-3"
            >
              <p className="text-[0.65rem] uppercase tracking-widest text-brand-smoke mb-1">
                {kpi.label}
              </p>
              <p
                className="font-display text-2xl font-light tabular-nums"
                style={{ color: kpi.color }}
              >
                {kpi.value}
              </p>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-smoke" />
            <Input
              className="pl-9"
              placeholder="Search name, email or message…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { v: "", label: "All" },
                { v: "new", label: "New" },
                { v: "read", label: "Read" },
                { v: "replied", label: "Replied" },
                { v: "closed", label: "Closed" },
              ] as { v: EnquiryStatus | ""; label: string }[]
            ).map((opt) => (
              <button
                key={opt.v || "all"}
                type="button"
                onClick={() => setStatus(opt.v)}
                className={
                  "rounded-full border px-3 py-1 text-xs font-medium transition-all " +
                  (status === opt.v
                    ? "border-brand-accent bg-brand-accent/10 text-brand-accent"
                    : "border-white/10 text-brand-smoke hover:border-white/25")
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        {isLoading ? (
          <p className="text-sm text-brand-smoke py-12 text-center">Loading…</p>
        ) : enquiries.length === 0 ? (
          <EmptyState
            title="No enquiries"
            description="Enquiries submitted from the storefront contact and stockist forms will appear here."
          />
        ) : (
          <div className="space-y-3">
            {enquiries.map((e) => (
              <EnquiryCard
                key={e.id}
                enquiry={e}
                onOpen={() => setOpenEnquiry(e)}
                onSetStatus={(next) => mutation.mutate({ id: e.id, next })}
                pending={mutation.isPending}
              />
            ))}
          </div>
        )}
      </div>

      <EnquiryDetailModal
        open={!!openEnquiry}
        enquiryId={openEnquiry?.id ?? null}
        initial={openEnquiry ?? undefined}
        onClose={() => setOpenEnquiry(null)}
      />
    </>
  );
}

function EnquiryCard({
  enquiry: e,
  onOpen,
  onSetStatus,
  pending,
}: {
  enquiry: Enquiry;
  onOpen: () => void;
  onSetStatus: (next: EnquiryStatus) => void;
  pending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const words = e.message.trim().split(/\s+/);
  const isLong = words.length > WORD_LIMIT;
  const shown =
    isLong && !expanded
      ? words.slice(0, WORD_LIMIT).join(" ") + "…"
      : e.message;

  return (
    <div className="rounded-2xl border border-white/5 bg-brand-charcoal p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg text-brand-cream">{e.name}</h3>
            <Badge tone={STATUS_TONE[e.status]}>{e.status}</Badge>
          </div>
          <p className="text-[0.7rem] uppercase tracking-widest text-brand-smoke mt-0.5">
            {e.type}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-brand-smoke">
            <a
              href={`mailto:${e.email}`}
              onClick={(ev) => ev.stopPropagation()}
              className="flex items-center gap-1 hover:text-brand-accent"
            >
              <Mail className="h-3 w-3" /> {e.email}
            </a>
            <a
              href={`tel:${e.phone}`}
              onClick={(ev) => ev.stopPropagation()}
              className="flex items-center gap-1 hover:text-brand-accent"
            >
              <Phone className="h-3 w-3" /> {e.phone}
            </a>
            <span className="tabular-nums">
              {new Date(e.created_at).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Status flow buttons + open thread */}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={onOpen}
            className="rounded-full border border-brand-accent/40 px-2.5 py-1 text-[0.7rem] text-brand-accent hover:bg-brand-accent/10 transition-all flex items-center gap-1"
          >
            <MessageSquare className="h-3 w-3" />
            Open thread
          </button>
          {STATUS_FLOW.filter((s) => s !== e.status).map((s) => (
            <button
              key={s}
              type="button"
              disabled={pending}
              onClick={() => onSetStatus(s)}
              className="rounded-full border border-white/10 px-2.5 py-1 text-[0.7rem] capitalize text-brand-smoke hover:border-brand-accent/40 hover:text-brand-accent transition-all disabled:opacity-50"
            >
              Mark {s}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="mt-3 w-full text-left whitespace-pre-wrap text-sm text-brand-cloud/90 border-t border-white/5 pt-3 hover:text-brand-cream transition-colors"
      >
        {shown}
      </button>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          className="mt-1 text-xs text-brand-accent hover:underline"
        >
          {expanded ? "View less" : "View more"}
        </button>
      )}
    </div>
  );
}
