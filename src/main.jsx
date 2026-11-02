import React from 'react';
import './qa-shim';
import { createRoot } from 'react-dom/client';
import App from './LiveApp';
import './styles.css';
createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
