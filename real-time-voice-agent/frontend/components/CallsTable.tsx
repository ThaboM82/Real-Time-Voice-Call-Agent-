import { useState, useEffect } from "react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { CallWithUser } from "../types/calls";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  msg: string;
  type: ToastType;
  priority: number;
}

// Helpers
const getPriority = (type: ToastType): number =>
  type === "error" ? 1 : type === "success" ? 2 : 3;

const createToast = (msg: string, type: ToastType): Toast => ({
  id: Date.now(),
  msg,
  type,
  priority: getPriority(type),
});

const scrollToTop = () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
};

const formatDate = (date?: string | null): string => {
  if (!date) return "—";
  const parsed = new Date(date);
  if (isNaN(parsed.getTime())) return "Invalid date";
  return parsed.toLocaleString();
};

const diffDate = (date: Date | null): string => {
  if (!date) return "—";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? "s" : ""} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? "s" : ""} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay !== 1 ? "s" : ""} ago`;

  return date.toLocaleString();
};

const downloadCSV = (filename: string, content: string) => {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Toast Hook
const useToasts = (maxVisible = 3) => {
  const [toastQueue, setToastQueue] = useState<Toast[]>([]);
  const [visibleToasts, setVisibleToasts] = useState<Toast[]>([]);

  const showToast = (msg: string, type: ToastType) => {
    const toast = createToast(msg, type);
    setToastQueue((prev) => [...prev, toast]);
  };

  useEffect(() => {
    if (visibleToasts.length < maxVisible && toastQueue.length > 0) {
      const sorted = [...toastQueue].sort((a, b) => a.priority - b.priority);
      const next = sorted[0];
      setToastQueue((prev) => prev.filter((t) => t.id !== next.id));
      setVisibleToasts((prev) => [...prev, next]);
      setTimeout(() => {
        setVisibleToasts((prev) => prev.filter((t) => t.id !== next.id));
      }, 3000);
    }
  }, [toastQueue, visibleToasts, maxVisible]);

  return { visibleToasts, showToast, setVisibleToasts };
};

// Pagination
interface PaginationProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  setPageSize: (size: number) => void;
  setCurrentPage: (page: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  pageSize,
  setPageSize,
  setCurrentPage,
}) => (
  <div className="sticky bottom-0 bg-white border-t mt-6 pt-4 flex items-center justify-between shadow">
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-600">Rows per page:</span>
      <select
        value={pageSize}
        onChange={(e) => {
          setCurrentPage(1);
          setPageSize(Number(e.target.value));
        }}
        className="border px-2 py-1 rounded"
      >
        <option value={10}>10</option>
        <option value={25}>25</option>
        <option value={50}>50</option>
      </select>
    </div>
    <div className="flex gap-2">
      <button
        onClick={() => setCurrentPage(Math.max(currentPage - 1, 1))}
        disabled={currentPage === 1}
        className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
      >
        ◀
      </button>
      {Array.from({ length: totalPages }, (_, i) => i + 1)
        .filter(
          (page) =>
            page === 1 ||
            page === totalPages ||
            (page >= currentPage - 1 && page <= currentPage + 1)
        )
        .map((page, idx, arr) => {
          const prevPage = arr[idx - 1];
          const showEllipsis = prevPage && page - prevPage > 1;
          return (
            <span key={page}>
              {showEllipsis && <span className="px-2">…</span>}
              <button
                onClick={() => setCurrentPage(page)}
                className={`px-3 py-1 rounded ${
                  currentPage === page
                    ? "bg-indigo-500 text-white"
                    : "bg-gray-200 hover:bg-gray-300"
                }`}
              >
                {page}
              </button>
            </span>
          );
        })}
      <button
        onClick={() => setCurrentPage(Math.min(currentPage + 1, totalPages))}
        disabled={currentPage === totalPages || totalPages === 0}
        className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
      >
        ▶
      </button>
    </div>
  </div>
);

// BackToTop
const BackToTop: React.FC<{ currentPage: number }> = ({ currentPage }) =>
  currentPage > 1 ? (
    <div className="fixed bottom-20 right-6 group">
      <button
        onClick={scrollToTop}
        className="px-4 py-2 bg-indigo-500 text-white rounded-full shadow-lg hover:bg-indigo-600"
      >
        ⬆ Back to Top
      </button>
      <span className="absolute -top-10 right-0 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
        Press "T" to jump up
      </span>
    </div>
  ) : null;

// Toast
const ToastComponent: React.FC<{
  toast: Toast;
  dismiss: (id: number) => void;
}> = ({ toast, dismiss }) => (
  <div
    role="status"
    aria-live="polite"
    className={`px-4 py-2 rounded shadow flex flex-col gap-2
      transform transition-all duration-300 ease-in-out
      bg-white group
      ${
        toast.type === "success"
          ? "border-l-4 border-green-500 text-green-800"
          : toast.type === "error"
          ? "border-l-4 border-red-500 text-red-800"
          : "border-l-4 border-blue-500 text-blue-800"
      }`}
  >
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        {toast.type === "success" && <span className="text-green-600">✔</span>}
        {toast.type === "error" && <span className="text-red-600">✖</span>}
        {toast.type === "info" && <span className="text-blue-600">ℹ</span>}
        <span>{toast.msg}</span>
      </div>
      <button
        onClick={() => dismiss(toast.id)}
        className="ml-4 text-lg font-bold text-gray-600 hover:text-gray-800"
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
    <div className="h-1 bg-gray-200 rounded overflow-hidden">
      <div
        className={`h-full ${
          toast.type === "success"
            ? "bg-green-500"
            : toast.type === "error"
            ? "bg-red-500"
            : "bg-blue-500"
                } group-hover:[animation-play-state:paused]`}
        style={{
          width: "100%",
          animation: "shrink 3s linear forwards",
          animationPlayState: "running",
        }}
      />
    </div>
  </div>
);

// ToastStack
const ToastStack: React.FC<{
  toasts: Toast[];
  dismiss: (id: number) => void;
}> = ({ toasts, dismiss }) => (
  <div className="fixed bottom-6 right-6 flex flex-col gap-2">
    {toasts.map((toast) => (
      <ToastComponent key={toast.id} toast={toast} dismiss={dismiss} />
    ))}
  </div>
);

// Main Component
const CallTable: React.FC = () => {
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = 20; // Example
  const { visibleToasts, showToast, setVisibleToasts } = useToasts();

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "t") scrollToTop();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // Example data
  const calls = Array.from({ length: pageSize }, (_, i) => ({
    id: i,
    caller: `Caller ${i + 1}`,
    time: new Date(Date.now() - i * 60000).toISOString(),
    status: i % 2 === 0 ? "Completed" : "Missed",
  }));

  const exportCSV = () => {
    const header = "Caller,Time,Status\n";
    const rows = calls
      .map((c) => `${c.caller},${formatDate(c.time)},${c.status}`)
      .join("\n");
    downloadCSV("calls.csv", header + rows);
    showToast("CSV downloaded", "success");
  };

  return (
    <div className="p-6">
      {/* Filters */}
      <div className="flex gap-4 mb-4">
        <input
          type="text"
          placeholder="Search caller..."
          className="border px-2 py-1 rounded"
        />
        <select className="border px-2 py-1 rounded">
          <option value="">All Statuses</option>
          <option value="Completed">Completed</option>
          <option value="Missed">Missed</option>
        </select>
      </div>

      {/* Column Toggles */}
      <div className="flex gap-4 mb-4">
        <label className="flex items-center gap-2">
          <input type="checkbox" defaultChecked /> Caller
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" defaultChecked /> Time
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" defaultChecked /> Status
        </label>
      </div>

      {/* Actions */}
      <div className="flex gap-4 mb-4">
        <button
          onClick={exportCSV}
          className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600"
        >
          Export CSV
        </button>
        <button
          onClick={() => showToast("Filters cleared", "info")}
          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
        >
          Clear Filters
        </button>
      </div>

      {/* Chart Toggle */}
      <div className="mb-4">
        <button
          onClick={() => showToast("Chart toggled", "info")}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Toggle Chart
        </button>
        <Bar
          data={{
            labels: ["Completed", "Missed"],
            datasets: [
              {
                label: "Calls",
                data: [
                  calls.filter((c) => c.status === "Completed").length,
                  calls.filter((c) => c.status === "Missed").length,
                ],
                backgroundColor: ["#10B981", "#EF4444"],
              },
            ],
          }}
        />
      </div>

      {/* Table */}
      <table className="w-full border">
        <thead>
          <tr>
            <th className="border px-4 py-2">Caller</th>
            <th className="border px-4 py-2">Time</th>
            <th className="border px-4 py-2">Relative</th>
            <th className="border px-4 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((c) => (
            <tr key={c.id}>
              <td className="border px-4 py-2">{c.caller}</td>
              <td className="border px-4 py-2">{formatDate(c.time)}</td>
              <td className="border px-4 py-2">{diffDate(new Date(c.time))}</td>
              <td
                className={`border px-4 py-2 ${
                  c.status === "Completed"
                    ? "text-green-600 font-bold"
                    : "text-red-600 font-bold"
                }`}
              >
                {c.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Pagination */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        pageSize={pageSize}
        setPageSize={setPageSize}
        setCurrentPage={setCurrentPage}
      />

      {/* BackToTop */}
      <BackToTop currentPage={currentPage} />

      {/* ToastStack */}
      <ToastStack
        toasts={visibleToasts}
        dismiss={(id) =>
          setVisibleToasts((prev) => prev.filter((t) => t.id !== id))
        }
      />
    </div>
  );
};

export default CallTable;
