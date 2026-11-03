import React from 'react';
import './qa-shim';
import { createRoot } from 'react-dom/client';
import App from './LiveApp';
import {ErrorBoundary} from './ErrorBoundary';
import './styles.css';
createRoot(document.getElementById('root')).render(<React.StrictMode><ErrorBoundary><App/></ErrorBoundary></React.StrictMode>);
