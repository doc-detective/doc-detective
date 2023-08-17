import React, { useState } from "react";

const ErrorList = ({ errorState }) => {
  const [errors, setErrors] = useState(errorState);

  const updateErrors = (key, value) => {
    setErrors((prevErrors) => ({ ...prevErrors, [key]: value }));
  };

  return (
    <div>
      <h2>Errors</h2>
      <ul>
        {Object.entries(errors).map(([key, value]) => (
          <li key={key}>
            {key}: {value}
            <button onClick={() => updateErrors(key, "")}>Clear</button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ErrorList;