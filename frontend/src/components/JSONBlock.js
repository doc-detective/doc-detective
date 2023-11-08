import React, { useState } from 'react';
import { CopyBlock, nord } from "react-code-blocks";

const JSONBlock = ({object, multiline}) => {
    // object: The object to display.
    // multiline: Whether to display the object as a single-line or multi-line JSON string.

    // State management.
    const [multilineValue, setMultiline] = useState(multiline);

    // Run custom logic.
    let text = "";
    // If args.pretty is true, return the object as a JSON string with 2 space indentation
    if (multiline) text = JSON.stringify(object, null, 2);
    // Else, return the object as a single-line JSON string
    else text = JSON.stringify(object);

    // Return the component.
    return (
        <div className="json-preview">
            <div className="toggle">
                <label htmlFor="multiline-toggle">Multiline:</label>
                <input
                    type="checkbox"
                    id="multiline-toggle"
                    checked={multiline}
                    onChange={() => setMultiline(!multilineValue)}
                />
            </div>
            <CopyBlock
                text={text}
                language="json"
                showLineNumbers={true}
                theme={nord}
                wrapLines={true}
                codeBlock
            />
        </div>
    );
}

// Default props.
JSONBlock.defaultProps = {
    object: {},
    multiline: true,
}

// Export the component.
export default JSONBlock;