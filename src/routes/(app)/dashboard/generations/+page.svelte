<script lang="ts">
  import { Chat } from '@ai-sdk/svelte';
	import { DefaultChatTransport } from 'ai';

  let input = $state('');
  const chat = new Chat({
    transport: new DefaultChatTransport({
        api: '/dashboard/generations'
    })
  });

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    chat.sendMessage({ text: input });
    input = '';
  }
</script>

<main>
  <ul>
    {#each chat.messages as message, messageIndex (messageIndex)}
      <li>
        <div>{message.role}</div>
        <div>
          {#each message.parts as part, partIndex (partIndex)}
            {#if part.type === 'text'}
              <div>{part.text}</div>
            {/if}
          {/each}
        </div>
      </li>
    {/each}
  </ul>
  <form onsubmit={handleSubmit}>
    <input bind:value={input} class="border border-red-500"/>
    <button type="submit">Send</button>
  </form>
</main>