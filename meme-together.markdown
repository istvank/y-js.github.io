---
layout: page
permalink: /meme-together/
---

Create memes collaboratively. Everyone is able to see the changes you make in Real-Time. Open this page in another tab and be amazed. You find the complete source code for this example on [Github](https://github.com/DadaMonad/meme-together.git).

This example works in every recent browser except `IE` (just because it uses polymer elements) and also not on some `mobile devices`.

<link rel="import" href="../bower_components/meme-together/meme-together.html">

<style>
  meme-together {
    margin-left: auto;
    margin-right: auto;
  }
</style>
<!--meme-together syncMethod="master-slave"></meme-together-->
<meme-together syncMethod="syncAll"></meme-together>
