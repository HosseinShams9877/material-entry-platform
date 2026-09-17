import sharp from 'sharp'
import fs from 'node:fs'

async function main() {
  const svg = fs.readFileSync('/home/z/my-project/public/icon.svg')
  for (const size of [192, 512]) {
    await sharp(svg, { density: 300 })
      .resize(size, size)
      .png()
      .toFile(`/home/z/my-project/public/icon-${size}.png`)
    console.log(`icon-${size}.png done`)
  }
  await sharp(svg, { density: 300 }).resize(180, 180).png().toFile('/home/z/my-project/public/apple-touch-icon.png')
  console.log('apple-touch-icon.png done')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
