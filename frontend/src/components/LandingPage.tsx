'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import {
    Shield, Radar, BarChart3, Upload, Zap, Eye, Clock,
    ChevronRight, Play, ArrowRight, CheckCircle2, Sparkles,
    ChevronDown,
} from 'lucide-react';

// ─── Animated Counter ─────────────────────────────────────────────────
function AnimatedNumber({ value, suffix = '' }: { value: number; suffix?: string }) {
    const [count, setCount] = useState(0);
    const ref = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        let start = 0;
        const duration = 2000;
        const step = (ts: number) => {
            if (!start) start = ts;
            const progress = Math.min((ts - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * value));
            if (progress < 1) requestAnimationFrame(step);
        };
        const observer = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) { requestAnimationFrame(step); observer.disconnect(); } },
            { threshold: 0.3 }
        );
        if (ref.current) observer.observe(ref.current);
        return () => observer.disconnect();
    }, [value]);

    return <span ref={ref}>{count}{suffix}</span>;
}

// ─── Tilt Card ────────────────────────────────────────────────────────
function TiltCard({ children, className = '', style }: {
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
}) {
    const cardRef = useRef<HTMLDivElement>(null);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const card = cardRef.current;
        if (!card) return;
        const rect = card.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        card.style.transform = `perspective(600px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg) translateY(-4px)`;
        // spotlight
        const spotlight = card.querySelector('.card-spotlight') as HTMLElement;
        if (spotlight) {
            spotlight.style.opacity = '1';
            spotlight.style.background = `radial-gradient(circle at ${e.clientX - rect.left}px ${e.clientY - rect.top}px, rgba(0,123,255,0.08) 0%, transparent 60%)`;
        }
    }, []);

    const handleMouseLeave = useCallback(() => {
        const card = cardRef.current;
        if (!card) return;
        card.style.transform = 'perspective(600px) rotateY(0deg) rotateX(0deg) translateY(0px)';
        const spotlight = card.querySelector('.card-spotlight') as HTMLElement;
        if (spotlight) spotlight.style.opacity = '0';
    }, []);

    return (
        <div
            ref={cardRef}
            className={className}
            style={{ ...style, transition: 'transform 0.2s ease-out' }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
        >
            <div className="card-spotlight" style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', pointerEvents: 'none', transition: 'opacity 0.3s', opacity: 0 }} />
            {children}
        </div>
    );
}

// ─── Feature Card ─────────────────────────────────────────────────────
function FeatureCard({ icon: Icon, title, description, delay }: {
    icon: typeof Shield;
    title: string;
    description: string;
    delay: number;
}) {
    return (
        <TiltCard
            className="landing-feature-card fade-in-up"
            style={{ animationDelay: `${delay}s`, position: 'relative', overflow: 'hidden' }}
        >
            <div className="landing-feature-icon">
                <Icon className="w-5 h-5 text-white" />
            </div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
                {title}
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#8E8E93', lineHeight: 1.6 }}>
                {description}
            </p>
        </TiltCard>
    );
}

// ─── Typing Effect ────────────────────────────────────────────────────
function TypingText({ phrases }: { phrases: string[] }) {
    const [current, setCurrent] = useState(0);
    const [text, setText] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        const phrase = phrases[current];
        const timeout = setTimeout(() => {
            if (!isDeleting) {
                setText(phrase.slice(0, text.length + 1));
                if (text.length === phrase.length) {
                    setTimeout(() => setIsDeleting(true), 2000);
                }
            } else {
                setText(phrase.slice(0, text.length - 1));
                if (text.length === 0) {
                    setIsDeleting(false);
                    setCurrent((current + 1) % phrases.length);
                }
            }
        }, isDeleting ? 40 : 80);
        return () => clearTimeout(timeout);
    }, [text, isDeleting, current, phrases]);

    return (
        <span className="landing-typing-text">
            {text}
            <span className="landing-cursor">|</span>
        </span>
    );
}

// ─── Main Landing Page ────────────────────────────────────────────────
export default function LandingPage() {
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const [scrollY, setScrollY] = useState(0);

    useEffect(() => {
        const handleMouse = (e: MouseEvent) => {
            setMousePos({ x: e.clientX, y: e.clientY });
        };
        const handleScroll = () => setScrollY(window.scrollY);
        window.addEventListener('mousemove', handleMouse);
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => {
            window.removeEventListener('mousemove', handleMouse);
            window.removeEventListener('scroll', handleScroll);
        };
    }, []);

    return (
        <div className="landing-page">
            {/* ─── Hero Section ─── */}
            <section className="landing-hero">
                {/* Animated background elements */}
                <div className="landing-hero-bg">
                    {/* Mouse-follow glow */}
                    <div
                        className="landing-hero-glow"
                        style={{
                            transform: `translate(${mousePos.x * 0.02}px, ${mousePos.y * 0.02}px)`,
                        }}
                    />
                    {/* Secondary glow */}
                    <div
                        className="landing-hero-glow-2"
                        style={{
                            transform: `translate(${-mousePos.x * 0.015}px, ${mousePos.y * 0.01}px)`,
                        }}
                    />

                    {/* Grid overlay */}
                    <div className="landing-grid-overlay" />

                    {/* Animated radar sweep */}
                    <div className="landing-radar-wrapper">
                        <div className="landing-radar-sweep" />
                        <div className="landing-radar-ring landing-radar-ring-1" />
                        <div className="landing-radar-ring landing-radar-ring-2" />
                        <div className="landing-radar-ring landing-radar-ring-3" />
                    </div>

                    {/* Aurora waves */}
                    <div className="landing-aurora">
                        <div className="landing-aurora-wave landing-aurora-wave-1" />
                        <div className="landing-aurora-wave landing-aurora-wave-2" />
                        <div className="landing-aurora-wave landing-aurora-wave-3" />
                    </div>

                    {/* Floating particles — deterministic positions to avoid SSR hydration mismatch */}
                    <div className="landing-particles">
                        {Array.from({ length: 30 }).map((_, i) => {
                            const seed = (n: number) => ((n * 9301 + 49297) % 233280) / 233280;
                            const s1 = seed(i * 7 + 1), s2 = seed(i * 13 + 2), s3 = seed(i * 17 + 3);
                            const s4 = seed(i * 23 + 4), s5 = seed(i * 29 + 5), s6 = seed(i * 31 + 6);
                            return (
                                <div
                                    key={i}
                                    className={`landing-particle ${i % 3 === 0 ? 'landing-particle--blue' : i % 3 === 1 ? 'landing-particle--purple' : 'landing-particle--cyan'}`}
                                    style={{
                                        left: `${s1 * 100}%`,
                                        top: `${s2 * 100}%`,
                                        animationDelay: `${s3 * 5}s`,
                                        animationDuration: `${3 + s4 * 4}s`,
                                        width: `${1.5 + s5 * 2.5}px`,
                                        height: `${1.5 + s6 * 2.5}px`,
                                    }}
                                />
                            );
                        })}
                    </div>

                    {/* Orbital rings */}
                    <div className="landing-orbits">
                        <div className="landing-orbit landing-orbit-1">
                            <div className="landing-orbit-dot" />
                        </div>
                        <div className="landing-orbit landing-orbit-2">
                            <div className="landing-orbit-dot" />
                        </div>
                    </div>
                </div>

                <div className="landing-hero-content" style={{ transform: `translateY(${scrollY * 0.15}px)`, opacity: Math.max(0, 1 - scrollY / 600) }}>
                    {/* Badge */}
                    <div className="landing-badge fade-in-up" style={{ animationDelay: '0.1s' }}>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>AI-Powered Runway Safety</span>
                        <span className="landing-badge-dot" />
                    </div>

                    {/* Headline */}
                    <h1 className="landing-headline fade-in-up" style={{ animationDelay: '0.2s' }}>
                        Airport Runway
                        <br />
                        <span className="landing-headline-gradient">FOD Detection</span>
                        <br />
                        System
                    </h1>

                    {/* Typing subtitle */}
                    <div className="fade-in-up" style={{ animationDelay: '0.35s', marginBottom: '12px' }}>
                        <TypingText phrases={[
                            'Detecting metal debris on runway 09L...',
                            'Scanning for foreign objects in real-time...',
                            'AI confidence: 97.3% — Alert triggered',
                            'Processing RTSP feed at 30 FPS...',
                        ]} />
                    </div>

                    {/* Subtitle */}
                    <p className="landing-subtitle fade-in-up" style={{ animationDelay: '0.45s' }}>
                        Real-time Foreign Object Debris detection powered by YOLO models.
                        <br />
                        Protect aircraft, save lives, ensure runway safety 24/7.
                    </p>

                    {/* CTA Buttons */}
                    <div className="landing-cta-group fade-in-up" style={{ animationDelay: '0.55s' }}>
                        <Link href="/input" className="landing-btn-primary">
                            <Play className="w-4 h-4" />
                            Start
                            <ChevronRight className="w-4 h-4" />
                        </Link>
                        <Link href="/dashboard" className="landing-btn-secondary">
                            <BarChart3 className="w-4 h-4" />
                            View Dashboard
                        </Link>
                    </div>

                    {/* Stats row */}
                    <div className="landing-stats fade-in-up" style={{ animationDelay: '0.65s' }}>
                        <div className="landing-stat">
                            <span className="landing-stat-value">
                                <AnimatedNumber value={99} suffix="%" />
                            </span>
                            <span className="landing-stat-label">Detection Accuracy</span>
                        </div>
                        <div className="landing-stat-divider" />
                        <div className="landing-stat">
                            <span className="landing-stat-value">
                                {'<'}<AnimatedNumber value={50} />ms
                            </span>
                            <span className="landing-stat-label">Response Time</span>
                        </div>
                        <div className="landing-stat-divider" />
                        <div className="landing-stat">
                            <span className="landing-stat-value">24/7</span>
                            <span className="landing-stat-label">Continuous Monitoring</span>
                        </div>
                        <div className="landing-stat-divider" />
                        <div className="landing-stat">
                            <span className="landing-stat-value">
                                <AnimatedNumber value={10} suffix="+" />
                            </span>
                            <span className="landing-stat-label">FOD Categories</span>
                        </div>
                    </div>
                </div>

                {/* Scroll indicator */}
                <div className="landing-scroll-indicator fade-in-up" style={{ animationDelay: '1.2s' }}>
                    <span style={{ fontSize: '0.65rem', color: '#4A4A4A', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>Scroll</span>
                    <ChevronDown className="w-4 h-4 landing-scroll-bounce" style={{ color: '#4A4A4A' }} />
                </div>
            </section>

            {/* ─── Features Section ─── */}
            <section className="landing-features-section">
                <div className="landing-section-header fade-in-up">
                    <span className="landing-section-badge">Core Capabilities</span>
                    <h2 className="landing-section-title">
                        Everything You Need for
                        <br />
                        <span className="landing-headline-gradient">Runway Safety</span>
                    </h2>
                    <p className="landing-section-desc">
                        Advanced AI detection pipeline with real-time monitoring, analytics, and alerting.
                    </p>
                </div>

                <div className="landing-features-grid">
                    <FeatureCard
                        icon={Eye}
                        title="Real-time AI Detection"
                        description="YOLOv8-powered object detection running at high FPS with accurate bounding boxes and classification."
                        delay={0.1}
                    />
                    <FeatureCard
                        icon={Radar}
                        title="Live Monitoring"
                        description="WebSocket-based live feed with instant detection overlays and real-time event notifications."
                        delay={0.2}
                    />
                    <FeatureCard
                        icon={BarChart3}
                        title="Analytics Dashboard"
                        description="Comprehensive analytics with trend charts, FOD distribution, detection maps, and exportable reports."
                        delay={0.3}
                    />
                    <FeatureCard
                        icon={Upload}
                        title="Multi-Source Input"
                        description="Support for RTSP streams, uploaded videos, and image files for flexible deployment scenarios."
                        delay={0.4}
                    />
                    <FeatureCard
                        icon={Zap}
                        title="Instant Alerts"
                        description="Configurable confidence thresholds with severity-based alerting for critical FOD detections."
                        delay={0.5}
                    />
                    <FeatureCard
                        icon={Clock}
                        title="Historical Records"
                        description="Full detection history with search, filtering, sorting, and CSV export capabilities."
                        delay={0.6}
                    />
                </div>
            </section>

            {/* ─── How It Works Section ─── */}
            <section className="landing-how-section">
                <div className="landing-section-header fade-in-up">
                    <span className="landing-section-badge">Workflow</span>
                    <h2 className="landing-section-title">How It Works</h2>
                </div>

                <div className="landing-steps">
                    {/* Connector line */}
                    <div className="landing-steps-line" />
                    {[
                        { step: '01', title: 'Input Source', desc: 'Upload video, connect RTSP camera, or provide image files', icon: Upload },
                        { step: '02', title: 'AI Processing', desc: 'YOLOv8 model analyzes frames in real-time for FOD objects', icon: Zap },
                        { step: '03', title: 'Detection & Alert', desc: 'Detected objects are classified, mapped, and alerts are triggered', icon: Shield },
                        { step: '04', title: 'Review & Export', desc: 'View analytics dashboard, review history, and export reports', icon: BarChart3 },
                    ].map((item, i) => (
                        <TiltCard key={i} className="landing-step fade-in-up" style={{ animationDelay: `${0.15 * i}s`, position: 'relative', overflow: 'hidden' }}>
                            <div className="landing-step-number">{item.step}</div>
                            <div className="landing-step-icon">
                                <item.icon className="w-5 h-5 text-white" />
                            </div>
                            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', marginBottom: '6px' }}>{item.title}</h3>
                            <p style={{ fontSize: '0.8rem', color: '#8E8E93', lineHeight: 1.5 }}>{item.desc}</p>
                        </TiltCard>
                    ))}
                </div>
            </section>

            {/* ─── Tech Stack ─── */}
            <section className="landing-tech-section">
                <div className="landing-section-header fade-in-up">
                    <span className="landing-section-badge">Technology</span>
                    <h2 className="landing-section-title">Built with Modern Stack</h2>
                    <p className="landing-section-desc">
                        Production-grade technologies powering every layer of the system.
                    </p>
                </div>

                <div className="landing-tech-grid fade-in-up" style={{ animationDelay: '0.15s' }}>
                    {[
                        { name: 'YOLOv8', desc: 'Object Detection AI', abbr: 'Y8', gradient: 'linear-gradient(135deg, #FF3B30, #FF6B6B)', shadow: 'rgba(255,59,48,0.3)' },
                        { name: 'Next.js 16', desc: 'React Framework', abbr: 'N', gradient: 'linear-gradient(135deg, #fff, #a0a0a0)', shadow: 'rgba(255,255,255,0.15)', dark: true },
                        { name: 'Rust + Actix', desc: 'High-Perf Backend', abbr: 'Rs', gradient: 'linear-gradient(135deg, #FF9500, #FFB84D)', shadow: 'rgba(255,149,0,0.3)' },
                        { name: 'PostgreSQL', desc: 'Relational Database', abbr: 'PG', gradient: 'linear-gradient(135deg, #336791, #5B9BD5)', shadow: 'rgba(51,103,145,0.3)' },
                        { name: 'WebSocket', desc: 'Real-time Stream', abbr: 'WS', gradient: 'linear-gradient(135deg, #34C759, #7AE28C)', shadow: 'rgba(52,199,89,0.3)' },
                        { name: 'Docker', desc: 'Container Deploy', abbr: 'D', gradient: 'linear-gradient(135deg, #2496ED, #60B4F7)', shadow: 'rgba(36,150,237,0.3)' },
                    ].map((tech, i) => (
                        <div key={i} className="landing-tech-card" style={{ animationDelay: `${0.08 * i}s` }}>
                            {/* Gradient icon */}
                            <div
                                className="landing-tech-icon"
                                style={{
                                    background: tech.gradient,
                                    boxShadow: `0 6px 20px ${tech.shadow}`,
                                    color: tech.dark ? '#000' : '#fff',
                                }}
                            >
                                <span style={{ fontWeight: 900, fontSize: '0.85rem', letterSpacing: '-0.02em' }}>{tech.abbr}</span>
                            </div>
                            {/* Name & desc */}
                            <span className="landing-tech-name">{tech.name}</span>
                            <span className="landing-tech-desc">{tech.desc}</span>
                            {/* Hover glow line */}
                            <div className="landing-tech-glow" style={{ background: tech.gradient }} />
                        </div>
                    ))}
                </div>
            </section>

            {/* ─── CTA Section ─── */}
            <section className="landing-cta-section">
                <div className="landing-cta-card fade-in-up">
                    <div className="landing-cta-glow" />
                    {/* Background scanner line */}
                    <div className="landing-cta-scanner" />
                    <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', marginBottom: '12px', position: 'relative', zIndex: 1 }}>
                        Ready to Secure Your Runway?
                    </h2>
                    <p style={{ fontSize: '0.95rem', color: '#8E8E93', marginBottom: '28px', position: 'relative', zIndex: 1 }}>
                        Start monitoring your runway for foreign object debris in minutes.
                    </p>
                    <div className="landing-cta-group" style={{ position: 'relative', zIndex: 1 }}>
                        <Link href="/input" className="landing-btn-primary">
                            Get Started
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                    <div className="landing-cta-features" style={{ position: 'relative', zIndex: 1 }}>
                        {['Real-time detection', 'No configuration needed', 'Instant analytics'].map((f, i) => (
                            <span key={i} className="landing-cta-feature">
                                <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#34C759' }} />
                                {f}
                            </span>
                        ))}
                    </div>
                </div>
            </section>

            {/* ─── Footer ─── */}
            <footer className="landing-footer">
                <p style={{ color: '#4A4A4A', fontSize: '0.8rem' }}>
                    © 2026 Airport Runway FOD Detection System · Built for FinalProject
                </p>
            </footer>
        </div>
    );
}
