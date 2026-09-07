"use client";

import { useId, useEffect, useRef, useState } from "react";

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

  return (
    <div className="relative" ref={wrapperRef}>
      <input
        id={id}
        type="text"
        className={`
          w-full px-4 py-3 rounded-lg border border-gray-300
          focus:ring-2 focus:ring-blue-500 focus:border-transparent
          transition-all duration-200 ease-in-out
          placeholder:text-gray-400
          ${disabled ? "bg-gray-100 cursor-not-allowed" : "bg-white"}
        `}
        value={open ? query : selected?.label || ""}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        placeholder={placeholder || `Search ${label || ""}`}
        required={required}
        disabled={disabled}
        autoComplete="off"
      />
      {open && !disabled && (
        <ul className="absolute z-20 mt-1 w-full max-h-60 overflow-auto rounded-lg border border-gray-300 bg-white shadow-lg">
          {!query && !options.some((o) => o.value === "") && (
            <li
              onMouseDown={(e) => {
                e.preventDefault();
                onChange({ target: { value: "" } });
                setOpen(false);
                setQuery("");
              }}
              className="px-4 py-2 text-sm text-gray-400 cursor-pointer hover:bg-gray-50"
            >
              Select {label}
            </li>
          )}
          {filtered.length === 0 ? (
            <li className="px-4 py-2 text-sm text-gray-400">No matches</li>
          ) : (
            filtered.map((option) => (
              <li
                key={option.value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange({ target: { value: option.value } });
                  setOpen(false);
                  setQuery("");
                }}
                className={`px-4 py-2 text-sm cursor-pointer hover:bg-blue-50 ${
                  option.value === value ? "bg-blue-100 font-medium" : ""
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
}) {
  const id = useId();

  return (
    <div className={`space-y-2 ${className}`}>
      {label && type !== "checkbox" && (
        <label
          htmlFor={id}
          className="block text-sm font-semibold text-gray-700"
        >
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      {type === "textarea" ? (
        <textarea
          id={id}
          className={`
            w-full px-4 py-3 rounded-lg border border-gray-300
            focus:ring-2 focus:ring-blue-500 focus:border-transparent
            transition-all duration-200 ease-in-out
            placeholder:text-gray-400
            ${disabled ? "bg-gray-100 cursor-not-allowed" : "bg-white"}
          `}
          rows="4"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
        />
      ) : type === "select" ? (
        <select
          id={id}
          className={`
            w-full px-4 py-3 rounded-lg border border-gray-300
            focus:ring-2 focus:ring-blue-500 focus:border-transparent
            transition-all duration-200 ease-in-out
            ${disabled ? "bg-gray-100 cursor-not-allowed" : "bg-white"}
          `}
          value={value}
          onChange={onChange}
          required={required}
          disabled={disabled}
        >
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
            className={`
              w-full px-4 py-3 rounded-lg border border-gray-300
              focus:ring-2 focus:ring-blue-500 focus:border-transparent
              transition-all duration-200 ease-in-out
              placeholder:text-gray-400
              ${disabled ? "bg-gray-100 cursor-not-allowed" : "bg-white"}
            `}
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
        <div className="flex flex-wrap gap-3">
          {options.map((option) => {
            const radioId = `${id}-${option.value}`;
            const isSelected = value === option.value;

            return (
              <label
                key={option.value}
                htmlFor={radioId}
                className={`
                  flex items-center px-4 py-2 rounded-lg border cursor-pointer
                  transition-all duration-200 ease-in-out
                  ${
                    isSelected
                      ? "border-blue-500 bg-blue-500 text-white"
                      : "border-gray-300 bg-white text-gray-700 hover:border-blue-400"
                  }
                  ${disabled ? "opacity-50 cursor-not-allowed" : ""}
                `}
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
                <span className="text-sm font-medium">{option.label}</span>
              </label>
            );
          })}
        </div>
      ) : type === "multiselect" ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2 mb-2">
            {value &&
              value.length > 0 &&
              value.map((selectedId , i) => {
                const selectedOption = options.find(
                  (opt) => opt.value === selectedId
                );
                return selectedOption ? (
                  <span key={i} className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                    {selectedOption.label}
                    <button
                      type="button"
                      onClick={() => {
                        const newValue = value.filter(
                          (id) => id !== selectedId
                        );
                        onChange({ target: { value: newValue } });
                      }}
                    >
                      ×
                    </button>
                  </span>
                ) : null;
              })}
          </div>

          <select
            value=""
            onChange={(e) => {
              if (e.target.value && !value.includes(e.target.value)) {
                onChange({ target: { value: [...value, e.target.value] } });
              }
            }}
          >
            <option value="">Add Surgery Helpers</option>
            {options
              .filter((opt) => !value.includes(opt.value))
              .map((option, i ) => (
                <option key={i} value={option.value}>{option.label}</option>
              ))}
          </select>
        </div>
      ) : type === "checkbox" ? (
        <div className="flex items-center">
          <input
            id={id}
            type="checkbox"
            className={`
              h-5 w-5 rounded border-gray-300
              focus:ring-2 focus:ring-blue-500
              text-blue-600 transition-all duration-200
              ${disabled ? "bg-gray-100 cursor-not-allowed" : ""}
            `}
            checked={value}
            onChange={onChange}
            required={required}
            disabled={disabled}
          />
          {label && (
            <label
              htmlFor={id}
              className="ml-3 block text-sm font-semibold text-gray-700"
            >
              {label}
              {required && <span className="text-red-500 ml-1">*</span>}
            </label>
          )}
        </div>
      ) : (
        <input
          id={id}
          type={type}
          className={`
            w-full px-4 py-3 rounded-lg border border-gray-300
            focus:ring-2 focus:ring-blue-500 focus:border-transparent
            transition-all duration-200 ease-in-out
            placeholder:text-gray-400
            ${disabled ? "bg-gray-100 cursor-not-allowed" : "bg-white"}
          `}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
        />
      )}
    </div>
  );
}
