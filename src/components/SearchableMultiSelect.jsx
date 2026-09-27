"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

export default function SearchableMultiSelect({
  label,
  value = [],
  onChange,
  options = [],
  icon: Icon,
  allLabel = "All",
  placeholder = "Search…",
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;

    const onClickOutside = (e) => {
      if (
        ref.current &&
        !ref.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onClickOutside);

    return () =>
      document.removeEventListener(
        "mousedown",
        onClickOutside
      );
  }, [open]);

  useEffect(() => {
    if (!open) {
      setTerm("");
    }
  }, [open]);

  const selectedSet = useMemo(
    () => new Set(value),
    [value]
  );

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();

    if (!t) return options;

    return options.filter((o) =>
      String(o.label)
        .toLowerCase()
        .includes(t)
    );
  }, [options, term]);

  const filteredValues = filtered.map(
    (o) => o.value
  );

  const allFilteredSelected =
    filteredValues.length > 0 &&
    filteredValues.every((v) =>
      selectedSet.has(v)
    );

  const toggleOne = (v) => {
    onChange(
      selectedSet.has(v)
        ? value.filter((x) => x !== v)
        : [...value, v]
    );
  };

  const toggleAllFiltered = () => {
    if (allFilteredSelected) {
      onChange(
        value.filter(
          (v) => !filteredValues.includes(v)
        )
      );
    } else {
      onChange([
        ...new Set([
          ...value,
          ...filteredValues,
        ]),
      ]);
    }
  };

  const summary =
    value.length === 0
      ? allLabel
      : value.length === 1
        ? options.find(
            (o) => o.value === value[0]
          )?.label || value[0]
        : `${value.length} selected`;

  return (
    <div
      className="w-full"
      ref={ref}
    >
      {}
      <div className="flex items-center justify-between mb-2">
        <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
          {label}
        </label>

        {value.length > 0 && (
          <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-slate-900 text-[10px] font-bold text-white">
            {value.length}
          </span>
        )}
      </div>

      <div className="relative">
        {}
        <button
          type="button"
          onClick={() =>
            setOpen((o) => !o)
          }
          aria-expanded={open}
          className={`
            group
            relative
            w-full
            min-h-[44px]
            rounded-xl
            border
            bg-white
            text-left
            flex
            items-center
            gap-2
            transition-all
            duration-150
            outline-none

            ${
              open
                ? "border-slate-400 ring-4 ring-slate-100 shadow-sm"
                : value.length > 0
                  ? "border-slate-300 hover:border-slate-400"
                  : "border-slate-200 hover:border-slate-300"
            }
          `}
        >
          {}
          {Icon && (
            <div className="absolute left-3 flex items-center justify-center">
              <Icon
                className={`
                  w-4 h-4
                  transition-colors
                  ${
                    value.length > 0 || open
                      ? "text-slate-700"
                      : "text-slate-400"
                  }
                `}
              />
            </div>
          )}

          {}
          <span
            className={`
              flex-1
              min-w-0
              truncate
              text-sm
              ${
                Icon
                  ? "pl-9"
                  : "pl-3.5"
              }
              pr-16
              ${
                value.length === 0
                  ? "text-slate-400"
                  : "text-slate-800 font-semibold"
              }
            `}
          >
            {summary}
          </span>

          {}
          <div className="absolute right-2 flex items-center gap-1">
            {value.length > 0 && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onChange([]);
                }}
                className="
                  flex
                  items-center
                  justify-center
                  w-7
                  h-7
                  rounded-lg
                  text-slate-400
                  hover:text-slate-700
                  hover:bg-slate-100
                  transition-colors
                "
                role="button"
                aria-label={`Clear ${label} filter`}
              >
                <X className="w-4 h-4" />
              </span>
            )}

            <span
              className="
                flex
                items-center
                justify-center
                w-7
                h-7
                rounded-lg
                text-slate-400
                group-hover:text-slate-600
                transition-all
              "
            >
              <ChevronDown
                className={`
                  w-4 h-4
                  transition-transform
                  duration-200
                  ${
                    open
                      ? "rotate-180 text-slate-700"
                      : ""
                  }
                `}
              />
            </span>
          </div>
        </button>

        {}
        {open && (
          <div
            className="
              absolute
              z-[100]
              mt-2
              w-full
              overflow-hidden
              rounded-2xl
              border
              border-slate-200
              bg-white
              shadow-[0_15px_40px_rgba(15,23,42,0.12)]
              animate-in
              fade-in
              zoom-in-95
              duration-100
            "
          >
            {}
            <div className="px-3 pt-3 pb-2">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-xs font-bold text-slate-800">
                    Select {label}
                  </p>

                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {value.length > 0
                      ? `${value.length} selected`
                      : "Choose one or more options"}
                  </p>
                </div>

                {value.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      onChange([])
                    }
                    className="
                      text-[10px]
                      font-semibold
                      text-slate-500
                      hover:text-slate-900
                      px-2
                      py-1
                      rounded-md
                      hover:bg-slate-100
                      transition-colors
                    "
                  >
                    Clear
                  </button>
                )}
              </div>

              {}
              <div className="relative">
                <Search
                  className="
                    absolute
                    left-3
                    top-1/2
                    -translate-y-1/2
                    w-4
                    h-4
                    text-slate-400
                    pointer-events-none
                  "
                />

                <input
                  autoFocus
                  type="text"
                  value={term}
                  onChange={(e) =>
                    setTerm(
                      e.target.value
                    )
                  }
                  placeholder={placeholder}
                  className="
                    w-full
                    h-9
                    pl-9
                    pr-3
                    rounded-lg
                    border
                    border-slate-200
                    bg-slate-50
                    text-sm
                    text-slate-800
                    placeholder:text-slate-400
                    outline-none
                    transition-all
                    focus:bg-white
                    focus:border-slate-400
                    focus:ring-4
                    focus:ring-slate-100
                  "
                />
              </div>
            </div>

            {}
            {filtered.length > 0 && (
              <button
                type="button"
                onClick={
                  toggleAllFiltered
                }
                className="
                  w-full
                  flex
                  items-center
                  gap-3
                  px-3
                  py-2.5
                  border-y
                  border-slate-100
                  bg-slate-50/70
                  hover:bg-slate-100
                  transition-colors
                  text-left
                "
              >
                {}
                <span
                  className={`
                    flex
                    items-center
                    justify-center
                    w-[18px]
                    h-[18px]
                    rounded-md
                    border
                    shrink-0
                    transition-all

                    ${
                      allFilteredSelected
                        ? "bg-slate-900 border-slate-900"
                        : "bg-white border-slate-300"
                    }
                  `}
                >
                  {allFilteredSelected && (
                    <Check className="w-3 h-3 text-white stroke-[3]" />
                  )}
                </span>

                <span className="flex-1">
                  <span className="block text-xs font-semibold text-slate-700">
                    {term.trim()
                      ? "Select all matches"
                      : "Select all"}
                  </span>

                  <span className="block text-[10px] text-slate-400 mt-0.5">
                    {filtered.length} option
                    {filtered.length !== 1
                      ? "s"
                      : ""}
                  </span>
                </span>
              </button>
            )}

            {}
            <div className="max-h-64 overflow-y-auto py-1 scrollbar-thin">
              {filtered.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
                    <Search className="w-4 h-4 text-slate-400" />
                  </div>

                  <p className="text-xs font-semibold text-slate-600">
                    No results found
                  </p>

                  <p className="text-[10px] text-slate-400 mt-1">
                    Try a different search term
                  </p>
                </div>
              ) : (
                filtered.map((o) => {
                  const checked =
                    selectedSet.has(
                      o.value
                    );

                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() =>
                        toggleOne(
                          o.value
                        )
                      }
                      className="
                        w-full
                        flex
                        items-center
                        gap-3
                        px-3
                        py-2.5
                        text-left
                        hover:bg-slate-50
                        active:bg-slate-100
                        transition-colors
                        group
                      "
                    >
                      {}
                      <span
                        className={`
                          flex
                          items-center
                          justify-center
                          w-[18px]
                          h-[18px]
                          rounded-md
                          border
                          shrink-0
                          transition-all

                          ${
                            checked
                              ? "bg-slate-900 border-slate-900"
                              : "bg-white border-slate-300 group-hover:border-slate-400"
                          }
                        `}
                      >
                        {checked && (
                          <Check className="w-3 h-3 text-white stroke-[3]" />
                        )}
                      </span>

                      {}
                      <span
                        className={`
                          flex-1
                          min-w-0
                          truncate
                          text-sm
                          transition-colors

                          ${
                            checked
                              ? "font-semibold text-slate-900"
                              : "text-slate-600 group-hover:text-slate-900"
                          }
                        `}
                      >
                        {o.label}
                      </span>

                      {}
                      {checked && (
                        <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
                          Selected
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {}
            {filtered.length > 0 && (
              <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100 bg-slate-50/60">
                <span className="text-[10px] text-slate-400">
                  {filtered.length} result
                  {filtered.length !== 1
                    ? "s"
                    : ""}
                </span>

                <span className="text-[10px] font-medium text-slate-500">
                  {value.length} selected
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
