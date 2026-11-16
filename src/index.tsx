import React from 'react';
import { createRoot } from 'react-dom/client';
import '@patternfly/patternfly/patternfly.css';
import './baobab.scss';
import { Application } from './app';
import cockpit from 'cockpit';

document.addEventListener('DOMContentLoaded', () => {
    cockpit.translate();
    const container = document.getElementById('app');
    if (container) {
        createRoot(container).render(<Application />);
    }
});
