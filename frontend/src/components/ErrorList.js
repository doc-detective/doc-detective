import React, { useState } from "react";

const ErrorList = ({ errorState }) => {
  return (
    <div>
      <h2>Errors</h2>
      <ul>
        {Object.entries(errorState).map(([key, value]) => (
          <li key={key}>
            <b>{key}</b>: {value}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ErrorList;