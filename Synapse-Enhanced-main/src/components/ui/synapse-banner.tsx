'use client'

import React, { useRef, useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Sparkles } from "./sparkles"

export const SynapseBanner = () => {
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
    <div className="relative w-full bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 overflow-hidden">  
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px]" />
        <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-primary/20 opacity-20 blur-[100px]" />
      </div>

      {/* Main content */}
      <div className="relative z-10 px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          {/* Tagline */}
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
              
              {/* Background text */}
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
              
              {/* Gradient text */}
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
              
              {/* Reveal text */}
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

          {/* Subtitle */}
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

          {/* Features grid */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="grid grid-cols-1 gap-6 sm:grid-cols-3 mb-12"
          >
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
              }
            ].map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.6 + index * 0.1 }}
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
          </motion.div>

          {/* CTA Button */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.8 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center"
          >
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="group relative inline-flex items-center justify-center px-8 py-4 text-lg font-semibold text-white bg-gradient-to-r from-primary to-primary/80 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden"
            >
              <span className="relative z-10">Get Started</span>
              <div className="absolute inset-0 bg-gradient-to-r from-primary/80 to-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </motion.button>
            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="group relative inline-flex items-center justify-center px-8 py-4 text-lg font-semibold text-white border-2 border-white/20 rounded-full hover:border-primary/50 transition-all duration-300 backdrop-blur-sm"
            >
              <span className="relative z-10">Learn More</span>
            </motion.button>
          </motion.div>
        </div>
      </div>

      {/* Floating elements */}
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
    </div>
  )
} 