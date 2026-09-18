"use client";

export function WorkflowStep({
  active,
  description,
  index,
  title,
}: {
  active: boolean;
  description: string;
  index: number;
  title: string;
}) {
  return (
    <li className="flex gap-2.5">
      <span
        className={
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold " +
          (active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500")
        }
      >
        {index}
      </span>
      <div className="min-w-0">
        <div className="text-xs font-bold text-slate-800">{title}</div>
        <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>
      </div>
    </li>
  );
}
