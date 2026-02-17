import UiSelect from "../ui/select";

function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

export default function Tabs({
  tabs = [],
  ariaLabel = "Tabs",
  onChange,
  className = "",
}) {
  if (!Array.isArray(tabs) || tabs.length === 0) {
    return null;
  }

  const currentIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab?.current),
  );
  const mobileOptions = tabs.map((tab, index) => ({
    label: tab?.name || "",
    value: String(index),
  }));

  const handleTabSelection = (tab, event) => {
    if (!tab) return;

    if (typeof onChange === "function") {
      if (event) event.preventDefault();
      onChange(tab);
      return;
    }

    if (tab.href && tab.href !== "#") {
      window.location.assign(tab.href);
    }
  };

  return (
    <div className={`${className}`.trim()}>
      <UiSelect
        id="tabs"
        name="tabs"
        value={String(currentIndex)}
        ariaLabel={ariaLabel}
        options={mobileOptions}
        className="mt-0 sm:hidden"
        onChange={(event) => {
          const selectedIndex = Number(event.target.value);
          handleTabSelection(tabs[selectedIndex]);
        }}
      />

      <div className="hidden sm:block">
        <div className="border-b border-slate-200">
          <nav aria-label={ariaLabel} className="-mb-px flex">
            {tabs.map((tab, index) => (
              <a
                key={`${tab?.name || "tab"}-${index}`}
                href={tab?.href || "#"}
                aria-current={tab?.current ? "page" : undefined}
                className={classNames(
                  tab?.current
                    ? "border-slate-900 text-slate-900"
                    : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700",
                  "border-b-2 px-2 py-3 font-medium whitespace-nowrap",
                )}
                onClick={(event) => handleTabSelection(tab, event)}
              >
                {tab?.name || ""}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
