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
            className="lumina-logo-svg"
        >
            {/* Hand-drawn organic blob shape from reference */}
            <path
                d="M52 10C61 10 66 18 74 24C86 32 96 46 90 62C84 78 72 78 60 88C48 98 36 94 24 84C12 74 6 62 8 46C10 30 22 22 32 24C38 18 44 10 52 10Z"
                fill="#000000"
            />
            {/* Asymmetrical white tilted oval eyes */}
            <ellipse cx="43" cy="53" rx="7.5" ry="10.5" fill="white" transform="rotate(-6, 43, 53)" />
            <ellipse cx="59" cy="53" rx="7.5" ry="10.5" fill="white" transform="rotate(6, 59, 53)" />
        </svg>
    );
}
