import React from 'react';

export default function LuminaLogo({ size = 32, color = '#111111' }) {
    // A clean SVG interpretation of the provided 5-petal black flower with two white dots.
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path
                d="M50 15C65 15 70 25 75 35C85 35 95 45 90 60C85 75 75 75 65 85C55 95 45 95 35 85C25 75 15 75 10 60C5 45 15 35 25 35C30 25 35 15 50 15Z"
                fill={color}
            />
            <circle cx="40" cy="55" r="8" fill="white" />
            <circle cx="60" cy="55" r="8" fill="white" />
        </svg>
    );
}
