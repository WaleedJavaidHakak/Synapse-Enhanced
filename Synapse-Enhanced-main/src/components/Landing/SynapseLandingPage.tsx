'use client'

import React, { useRef, useEffect, useState } from "react"
import { motion } from "framer-motion"
import { SignInButton, SignUpButton } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'
import { AnimataButton } from '@/components/ui/animata-button'
import RippleButton from '@/components/ui/ripple-button'
import { Sparkles } from "@/components/ui/sparkles"
import { useRouter } from 'next/navigation'
import { 
  MessageCircle, 
  ArrowRight,
  Plus,
  Rocket,
  Sparkles as SparklesIcon
} from 'lucide-react'

export function SynapseLandingPage() {
  const router = useRouter()
  const svgRef = useRef<SVGSVGElement>(null)
  const [cursor, setCursor] = useState({ x: 0, y: 0 })
  const [hovered, setHovered] = useState(false)
  const [maskPosition, setMaskPosition] = useState({ cx: "50%", cy: "50%" })

  useEffect(() => {
    if (svgRef.current && cursor.x !== null && cursor.y !== null) {
      const svgRect = svgRef.current.getBoundingClientRect()
      const cxPercentage = ((cursor.x - svgRect.left) / svgRect.width) * 100
      const cyPercentage = ((cursor.y - svgRect.top) / svgRect.height) * 100
      setMaskPosition({
        cx: `${cxPercentage}%`,
        cy: `${cyPercentage}%`,
      })
    }
  }, [cursor])

  return (
    <div className="min-h-screen bg-slate-900">
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-slate-900/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <div className="bg-gradient-to-r from-primary to-primary/80 p-2 rounded-lg">
                <MessageCircle className="h-6 w-6 text-white" />
              </div>
              <span className="text-xl font-bold text-white">
                Synapse
              </span>
            </div>
            
            <div className="flex items-center space-x-4">
              <SignInButton 
                mode="redirect"
                fallbackRedirectUrl="/chat"
              >
                <Button variant="ghost" className="text-white hover:text-primary">
                  Sign In
                </Button>
              </SignInButton>
              <SignUpButton 
                mode="redirect"
                fallbackRedirectUrl="/chat"
              >
                <Button variant="gradient" className="btn-animate">
                  Get Started
                </Button>
              </SignUpButton>
            </div>
          </div>
        </div>
      </nav>

      <section className="relative w-full bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 overflow-hidden pt-16">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px]" />
          <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-primary/20 opacity-20 blur-[100px]" />
        </div>

        <div className="relative z-10 px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="mb-4"
            >
              <span className="inline-flex items-center rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary ring-1 ring-inset ring-primary/20">
                <Sparkles>
                  <div className="mr-2 h-4 w-4" />
                </Sparkles>
                Next Generation Communication
              </span>
            </motion.div>
            <div className="relative mb-8">
              <svg
                ref={svgRef}
                width="100%"
                height="120"
                viewBox="0 0 800 120"
                xmlns="http://www.w3.org/2000/svg"
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                onMouseMove={(e) => setCursor({ x: e.clientX, y: e.clientY })}
                className="select-none"
              >
                <defs>
                  <linearGradient
                    id="synapseGradient"
                    gradientUnits="userSpaceOnUse"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="0%"
                  >
                    {hovered && (
                      <>
                        <stop offset="0%" stopColor="#25D366" />
                        <stop offset="25%" stopColor="#128C7E" />
                        <stop offset="50%" stopColor="#075E54" />
                        <stop offset="75%" stopColor="#128C7E" />
                        <stop offset="100%" stopColor="#25D366" />
                      </>
                    )}
                  </linearGradient>

                  <motion.radialGradient
                    id="revealMask"
                    gradientUnits="userSpaceOnUse"
                    r="15%"
                    initial={{ cx: "50%", cy: "50%" }}
                    animate={maskPosition}
                    transition={{ duration: 0, ease: "easeOut" }}
                  >
                    <stop offset="0%" stopColor="white" />
                    <stop offset="100%" stopColor="black" />
                  </motion.radialGradient>
                  <mask id="textMask">
                    <rect
                      x="0"
                      y="0"
                      width="100%"
                      height="100%"
                      fill="url(#revealMask)"
                    />
                  </mask>
                </defs>
                
                <text
                  x="50%"
                  y="50%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  strokeWidth="1"
                  className="fill-transparent stroke-white/20 font-bold text-6xl sm:text-7xl lg:text-8xl"
                  style={{ opacity: hovered ? 0.3 : 0 }}
                >
                  SYNAPSE
                </text>
                
                <motion.text
                  x="50%"
                  y="50%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  strokeWidth="1"
                  className="fill-transparent stroke-white font-bold text-6xl sm:text-7xl lg:text-8xl"
                  style={{
                    fill: hovered ? "url(#synapseGradient)" : "white",
                    stroke: hovered ? "url(#synapseGradient)" : "white",
                  }}
                >
                  SYNAPSE
                </motion.text>
                
                <motion.text
                  x="50%"
                  y="50%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  strokeWidth="1"
                  className="fill-transparent stroke-primary font-bold text-6xl sm:text-7xl lg:text-8xl"
                  style={{
                    fill: "url(#synapseGradient)",
                    stroke: "url(#synapseGradient)",
                    mask: "url(#textMask)",
                  }}
                >
                  SYNAPSE
                </motion.text>
              </svg>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mb-12"
            >
              <p className="text-xl text-gray-300 sm:text-2xl">
                Connect. Communicate. Collaborate.
                <span className="block text-primary font-semibold">
                  Experience the future of messaging
                </span>
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="flex flex-col sm:flex-row gap-6 justify-center items-center mb-16"
            >
              <SignUpButton 
                mode="redirect"
                fallbackRedirectUrl="/chat"
              >
                <AnimataButton
                  variant="gradient"
                  size="xl"
                  icon={<Rocket className="h-6 w-6" />}
                  iconPosition="left"
                  className="min-w-[200px]"
                >
                  Get Started Free
                </AnimataButton>
              </SignUpButton>
              
              <RippleButton
                variant="primary"
                size="xl"
                onClick={() => router.push('/chat')}
                className="min-w-[200px] shadow-lg hover:shadow-xl"
              >
                Try Demo
              </RippleButton>
            </motion.div>
          </div>
        </div>

        <div className="absolute inset-0 pointer-events-none">
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 bg-primary/30 rounded-full"
              animate={{
                x: [0, 100, 0],
                y: [0, -50, 0],
                opacity: [0, 1, 0],
              }}
              transition={{
                duration: 3 + i * 0.5,
                repeat: Infinity,
                delay: i * 0.5,
              }}
              style={{
                left: `${20 + i * 15}%`,
                top: `${30 + i * 10}%`,
              }}
            />
          ))}
        </div>
      </section>

      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Why Choose Synapse?
            </h2>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Built with cutting-edge technology to provide the best messaging experience
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: "🔒",
                title: "Secure",
                description: "End-to-end encryption for your conversations"
              },
              {
                icon: "⚡",
                title: "Fast",
                description: "Real-time messaging with instant delivery"
              },
              {
                icon: "🌐",
                title: "Global",
                description: "Connect with anyone, anywhere in the world"
              },
              {
                icon: "📞",
                title: "Voice Calls",
                description: "Crystal clear voice and video calls"
              },
              {
                icon: "📁",
                title: "File Sharing",
                description: "Share documents, images, and files seamlessly"
              },
              {
                icon: "👥",
                title: "Group Chats",
                description: "Create and manage group conversations easily"
              }
            ].map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                viewport={{ once: true }}
                whileHover={{ scale: 1.05 }}
                className="group relative rounded-2xl bg-white/5 p-6 backdrop-blur-sm border border-white/10 hover:border-primary/30 transition-all duration-300"
              >
                <div className="text-3xl mb-3">{feature.icon}</div>
                <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-primary transition-colors">
                  {feature.title}
                </h3>
                <p className="text-gray-400 text-sm">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-slate-800/50 to-slate-900/50">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 text-center">
            {[
              { number: "10M+", label: "Active Users" },
              { number: "150+", label: "Countries" },
              { number: "99.9%", label: "Uptime" },
              { number: "24/7", label: "Support" }
            ].map((stat, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="p-6"
              >
                <div className="text-4xl md:text-5xl font-bold text-primary mb-2">
                  {stat.number}
                </div>
                <div className="text-gray-300 text-lg">
                  {stat.label}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-primary/10 to-primary/5">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Ready to Get Started?
            </h2>
            <p className="text-xl text-gray-300 mb-8">
              Join millions of users who trust Synapse for their communication needs
            </p>
            
            <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
              <SignUpButton 
                mode="redirect"
                fallbackRedirectUrl="/chat"
              >
                <AnimataButton
                  variant="primary"
                  size="lg"
                  icon={<MessageCircle className="h-5 w-5" />}
                  iconPosition="left"
                  className="min-w-[180px]"
                >
                  Start Messaging Now
                </AnimataButton>
              </SignUpButton>
              
              <RippleButton
                variant="primary"
                size="lg"
                onClick={() => router.push('/chat')}
                className="min-w-[180px] shadow-lg hover:shadow-xl"
              >
                Try Demo
              </RippleButton>
            </div>
          </motion.div>
        </div>
      </section>
            
      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-white/10">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <div className="bg-gradient-to-r from-primary to-primary/80 p-2 rounded-lg">
                  <MessageCircle className="h-6 w-6 text-white" />
                </div>
                <span className="text-xl font-bold text-white">Synapse</span>
              </div>
              <p className="text-gray-400">
                The future of communication is here. Connect, collaborate, and create with Synapse.
              </p>
            </div>
            
            <div>
              <h3 className="text-white font-semibold mb-4">Product</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-primary transition-colors">Features</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Pricing</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">API</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Documentation</a></li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-white font-semibold mb-4">Company</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-primary transition-colors">About</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Contact</a></li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-white font-semibold mb-4">Support</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-primary transition-colors">Help Center</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Community</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Status</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Security</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-white/10 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2024 Synapse. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
} 