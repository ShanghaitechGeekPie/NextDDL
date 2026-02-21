declare module 'typewriter-effect' {
  export interface TypewriterOptions {
    strings?: string | string[]
    cursor?: string
    delay?: 'natural' | number
    deleteSpeed?: 'natural' | number
    loop?: boolean
    autoStart?: boolean
    devMode?: boolean
    wrapperClassName?: string
    cursorClassName?: string
    onCreateTextNode?: (textNode: Text, character: string) => Text
    onRemoveNode?: (node: { node: Node }) => void
  }

  export interface TypewriterClass {
    typeString(string: string): TypewriterClass
    pauseFor(ms: number): TypewriterClass
    deleteAll(speed?: number): TypewriterClass
    deleteChars(amount: number): TypewriterClass
    callFunction(cb: (state: any) => void, thisArg?: any): TypewriterClass
    changeDelay(delay: number): TypewriterClass
    changeDeleteSpeed(speed: number): TypewriterClass
    start(): TypewriterClass
    stop(): TypewriterClass
    state: any
  }

  export interface TypewriterProps {
    onInit?: (typewriter: TypewriterClass) => void
    options?: TypewriterOptions
  }

  const Typewriter: React.FC<TypewriterProps>
  export default Typewriter
}
