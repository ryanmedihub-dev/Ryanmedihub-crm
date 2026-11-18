import { X } from "lucide-react";

const BenefitsManager = ({ benefits, onChange, onAdd, onRemove }) => {
  const predefinedBenefits = [
    "5 Free PRP Sessions",
    "Deep Headwash",
    "5 Days Medicines Included",
    "Bandage Removal",
    "GFC",
    "3 Month Medicine",
    "20 Year Guarantee",
    "",
  ];

  const handleBenefitToggle = (benefit) => {
    const currentBenefits = [...benefits];
    const benefitIndex = currentBenefits.indexOf(benefit);

    if (benefitIndex > -1) {
      onRemove(benefitIndex);
    } else {
      onAdd(benefit);
    }
  };

  const handleCustomBenefitAdd = (customBenefit) => {
    if (customBenefit.trim() && !benefits.includes(customBenefit.trim())) {
      onAdd(customBenefit.trim());
    }
  };

  return (
    <div className="md:col-span-2">
      <label className="block text-md underline font-semibold text-gray-700 mb-4">
        Additional Benefits *
      </label>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        {predefinedBenefits.map((benefit) => (
          <label
            key={benefit}
            className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors duration-200"
          >
            <input
              type="checkbox"
              checked={benefits.includes(benefit)}
              onChange={() => handleBenefitToggle(benefit)}
              className="h-4 w-4 text-blue-600 focus:ring-indigo-500/30 border-gray-300 rounded"
            />
            <span className="text-sm font-medium text-gray-700">{benefit}</span>
          </label>
        ))}
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Add Custom Benefit
        </label>
        <div className="flex space-x-3">
          <input
            type="text"
            className="flex-1 px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500/30 focus:border-transparent transition-all duration-200 shadow-sm"
            placeholder="Enter custom benefit"
            onKeyPress={(e) => {
              if (e.key === "Enter") {
                handleCustomBenefitAdd(e.target.value);
                e.target.value = "";
              }
            }}
          />
          <button
            type="button"
            className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors duration-200 font-medium"
            onClick={(e) => {
              const input = e.target.previousElementSibling;
              handleCustomBenefitAdd(input.value);
              input.value = "";
            }}
          >
            Add
          </button>
        </div>
      </div>

      {benefits.length > 0 && (
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Selected Benefits ({benefits.length})
          </label>
          <div className="flex flex-wrap gap-2">
            {benefits.map((benefit, index) => (
              <div
                key={index}
                className="flex items-center space-x-2 bg-blue-100 text-blue-800 px-3 py-2 rounded-lg"
              >
                <span className="text-sm font-medium">{benefit}</span>
                <button aria-label="Close"
                  type="button"
                  className="text-blue-600 hover:text-blue-800 transition-colors duration-200"
                  onClick={() => onRemove(index)}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default BenefitsManager;