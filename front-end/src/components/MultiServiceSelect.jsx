import React, { useState } from "react";
import SERVICES from "../config/services";
import "../css/MultiServiceSelect.css";
import { FaPlus } from "react-icons/fa";

const SEPARATOR = " | ";

export default function MultiServiceSelect({
  value = "",
  onChange,
  idPrefix = "service",
}) {
  // Custom names exist only while this form is mounted; never saved as options.
  const [customServices, setCustomServices] = useState([]);
  const [newService, setNewService] = useState("");
  const selected = value
    ? value
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const options = [...new Set([...SERVICES, ...customServices, ...selected])];

  const setSelected = (items) => {
    const unique = [...new Set(items)];
    const next = unique.join(SEPARATOR);
    if (next.length > 500)
      return window.alert(
        "Selected services are too long (maximum 500 characters). Remove a service first.",
      );
    onChange(next);
  };
  const add = () => {
    const name = newService.trim().replace(/\s+/g, " ");
    if (!name) return window.alert("Enter a service name.");
    if (name.length > 100 || name.includes("|"))
      return window.alert(
        "Use a service name under 100 characters without the | symbol.",
      );
    const existing = options.find(
      (option) => option.toLowerCase() === name.toLowerCase(),
    );
    const nextName = existing || name;
    if (!existing) {
      const nextCustom = [...customServices, name];
      setCustomServices(nextCustom);
    }
    setSelected([...selected, nextName]);
    setNewService("");
  };
  return (
    <div className="multi-services">
      <div
        className="multi-services-options"
        role="group"
        aria-label="Select one or more dental services"
      >
        {options.map((service, i) => (
          <label
            className="multi-services-option"
            key={service}
            htmlFor={`${idPrefix}-${i}`}
          >
            <input
              id={`${idPrefix}-${i}`}
              type="checkbox"
              checked={selected.includes(service)}
              onChange={(event) =>
                setSelected(
                  event.target.checked
                    ? [...selected, service]
                    : selected.filter((v) => v !== service),
                )
              }
            />
            <span>{service}</span>
          </label>
        ))}
      </div>
      <div className="multi-services-add">
        <input
          type="text"
          value={newService}
          maxLength={100}
          placeholder="Other service (enter name)"
          aria-label="Other service"
          onChange={(event) => setNewService(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <button type="button" onClick={add}>
          <FaPlus />
        </button>
      </div>
      <small>
        {selected.length
          ? `${selected.length} selected: ${selected.join(", ")}`
          : "Choose at least one service."}
      </small>
    </div>
  );
}
