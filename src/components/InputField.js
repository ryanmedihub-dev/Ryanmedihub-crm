"use client";

import { useId, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { inputClass } from "@/components/ui";

function SearchableSelect({ id, value, onChange, options, label, placeholder, required, disabled }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  const pick = (v) => {
    onChange({ target: { value: v } });
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        className={inputClass(false)}
        value={open ? query : selected?.label || ""}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setOpen(false); setQuery(""); }
          if (e.key === "Enter" && open && filtered.length === 1) { e.preventDefault(); pick(filtered[0].value); }
        }}
        placeholder={placeholder || `Search ${label || ""}`}
        required={required}
        disabled={disabled}
        autoComplete="off"
      />
      {open && !disabled && (
        <ul
          role="listbox"
          className="pop-in absolute z-30 mt-1 w-full max-h-60 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1"
        >
          {!query && !options.some((o) => o.value === "") && (
            <li
              role="option"
              aria-selected={!value}
              onMouseDown={(e) => { e.preventDefault(); pick(""); }}
              className="px-3 py-1.5 text-sm text-gray-400 cursor-pointer hover:bg-gray-50"
            >
              Select {label}
            </li>
          )}
          {filtered.length === 0 ? (
            <li className="px-3 py-1.5 text-sm text-gray-400">No matches</li>
          ) : (
            filtered.map((option) => (
              <li
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                onMouseDown={(e) => { e.preventDefault(); pick(option.value); }}
                className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50 ${
                  option.value === value ? "text-indigo-700 font-medium bg-indigo-50/60" : "text-gray-700"
                }`}
              >
                {option.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

export default function InputField({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  required = false,
  disabled = false,
  options = [],
  className = "",
  hint,
}) {
  const id = useId();
  const base = inputClass(false);

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && type !== "checkbox" && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
      )}

      {type === "textarea" ? (
        <textarea
          id={id}
          className={inputClass(false, "h-auto py-2")}
          rows="4"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
        />
      ) : type === "select" ? (
        <select id={id} className={`${base} cursor-pointer`} value={value} onChange={onChange} required={required} disabled={disabled}>
          <option value="">Select {label}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : type === "combobox" ? (
        <>
          <input
            id={id}
            type="text"
            list={`${id}-list`}
            className={base}
            value={value}
            onChange={onChange}
            placeholder={placeholder || `Type or pick a ${label || "value"}`}
            required={required}
            disabled={disabled}
            autoComplete="off"
          />
          <datalist id={`${id}-list`}>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </datalist>
        </>
      ) : type === "searchable-select" ? (
        <SearchableSelect
          id={id}
          value={value}
          onChange={onChange}
          options={options}
          label={label}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
        />
      ) : type === "radio" ? (
        <div className="inline-flex flex-wrap gap-1 p-1 bg-gray-100 rounded-lg" role="radiogroup" aria-label={label}>
          {options.map((option) => {
            const radioId = `${id}-${option.value}`;
            const isSelected = value === option.value;
            return (
              <label
                key={option.value}
                htmlFor={radioId}
                className={`flex items-center h-7 px-3 rounded-md text-sm cursor-pointer transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-indigo-500 ${
                  isSelected ? "bg-white text-gray-900 font-medium shadow-xs" : "text-gray-600 hover:text-gray-900"
                } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <input
                  id={radioId}
                  type="radio"
                  name={id}
                  value={option.value}
                  checked={isSelected}
                  onChange={onChange}
                  disabled={disabled}
                  className="sr-only"
                />
                {option.label}
              </label>
            );
          })}
        </div>
      ) : type === "multiselect" ? (
        <div className="space-y-2">
          {value && value.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {value.map((selectedId, i) => {
                const selectedOption = options.find((opt) => opt.value === selectedId);
                return selectedOption ? (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700"
                  >
                    {selectedOption.label}
                    <button
                      type="button"
                      aria-label={`Remove ${selectedOption.label}`}
                      className="p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200"
                      onClick={() => {
                        const newValue = value.filter((v) => v !== selectedId);
                        onChange({ target: { value: newValue } });
                      }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ) : null;
              })}
            </div>
          )}

          <select
            id={id}
            className={`${base} cursor-pointer`}
            value=""
            disabled={disabled}
            onChange={(e) => {
              if (e.target.value && !value.includes(e.target.value)) {
                onChange({ target: { value: [...value, e.target.value] } });
              }
            }}
          >
            <option value="">Add Surgery Helpers</option>
            {options
              .filter((opt) => !value.includes(opt.value))
              .map((option, i) => (
                <option key={i} value={option.value}>
                  {option.label}
                </option>
              ))}
          </select>
        </div>
      ) : type === "checkbox" ? (
        <div className="flex items-center">
          <input
            id={id}
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 accent-indigo-600 cursor-pointer disabled:cursor-not-allowed"
            checked={value}
            onChange={onChange}
            required={required}
            disabled={disabled}
          />
          {label && (
            <label htmlFor={id} className="ml-2.5 block text-sm font-medium text-gray-700 cursor-pointer">
              {label}
              {required && <span className="text-rose-500 ml-0.5">*</span>}
            </label>
          )}
        </div>
      ) : (
        <input
          id={id}
          type={type}
          className={base}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
      )}
      {hint && <p id={`${id}-hint`} className="text-xs text-gray-500">{hint}</p>}
    </div>
  );
}
