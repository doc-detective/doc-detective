import React from 'react';
import Button from '@mui/material/Button';

const TestButton = () => {
    // function to be called
    const myFunction = () => {
        console.log("Button was clicked!");
    }

    return (
        <div>
            <Button variant="contained" color="primary" onClick={myFunction}>
                Click Me!
            </Button>
        </div>
    );
}

export default TestButton;
