import React, { useState, useRef } from 'react';

function HelpTooltip({ text }) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef(null);

  const show = () => {
    clearTimeout(timeoutRef.current);
    setVisible(true);
  };

  const hide = () => {
    timeoutRef.current = setTimeout(() => setVisible(false), 150);
  };

  return (
    <span
      className="help-tooltip-wrapper"
      onMouseEnter={show}
      onMouseLeave={hide}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="help-icon">?</span>
      {visible && (
        <span className="help-tooltip-popup">
          <span className="help-tooltip-arrow" />
          {text}
        </span>
      )}
    </span>
  );
}

export default HelpTooltip;