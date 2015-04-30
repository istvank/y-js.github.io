---
layout: y-page
title: Tutorial
permalink: /tutorial/
---

This tutorial will give you a good idea on how you can work with Yjs. Check the [documentation](../doc) for a detailed instruction on how you can use and install the components that are described here. Also make sure to explore the [examples](../examples).

Furthermore, you are encouraged to do everything you find here in your browser console. Try to tinker with some of the examples. If you have any problem, ask a question in the comments section at the bottom of this page.

### Connectors
First of all, you have to define how you want your peers to connect to each other. Therefore, we introduce the concept of *connectors*. A connector is an interfaces that defines how your clients communicate with each other. The cool thing in Yjs is, that you can simply interchange different connectors. You can swith from the XMPP connector to the WebRTC connector by changing only a few lines of code. I this tutorial we will use the XMPP connector. But you should check out the WebRTC connector too - it is really fast!

{% highlight html %}
<script src="./y-xmpp/y-xmpp.min.js"></script>
<script>
  // Connect to our testing server, and join an XMPP multi user chat room.
  var connector = new Y.XMPP().join("my-awesome-roomname");
</script>
{% endhighlight %}

The XMPP connector defines how to exchange updates through an XMPP multi-user-chat room ([XEP-0045](http://xmpp.org/extensions/xep-0045.html)).

#####  Tips:

* Try to pick a random room name, so that it does not collide with another users room name. E.g. "efkdyjd0" - you can generate random room names like this: `(Math.random()+1).toString(36).substring(10)`
* In production, you can set up a server instance that manages state. It is easy to set up a nodejs server with Yjs (see [server.js](https://github.com/DadaMonad/meme-together/blob/master/server.js) from the meme-together application).
* You get the *ids* of all connected users with `connector.connections`. (works only *after* you bound the connector to an instance of Y)
* Check the [documentation](./doc), to find out more about the different sync methods!

##### Try it
Open you browser console, and create a connector:

{% highlight javascript %}
var connector = new Y.XMPP().join("some-random-room-name");
console.log(connector.connections) // retrieve the ids of all connected users
{% endhighlight %}

### Create an instance of Y
Now, you can create your shared document, which is an instance of Y (created with the *new* operator)

{% highlight html %}
<script src="./yjs/y.js"></script>
<script>
  var y = new Y(connector);
</script>
{% endhighlight %}


That's it! Now you can work on your shared instance of Y. It represents a JSON object, where every client can *add*, *update*, and *delete* object-properties. Try to create an instance of Y in your browser console and play with it. It is probably most fun if you create another instance of Y in another browser window, so you can see life update in the other browser window.

##### Create Property

Create, or update property "name" with value "42":

{% highlight javascript %}
y.val("name",42)
console.log(y.val("name")) // => 42
{% endhighlight %}


Set an object as a property.

{% highlight javascript %}
y.val("object",{other_object: "hi there"})
console.log(y.val("object").val("other_object")) // => "hi there"
{% endhighlight %}

##### Delete Property
Delete the "object" property. If you have still references to this object, they will be unusable.

{% highlight javascript %}
y.delete("object")
{% endhighlight %}

##### Observe Changes
Every type has its own bunch of events, to that you can listen to. All ObjectTypes can throw *add*, *update*, and *delete* events. The observe pattern in Yjs is very similar to [Object.observe](http://www.html5rocks.com/en/tutorials/es7/observe/?redirect_from_locale=de), an upcoming standard for observing changes on Javascript objects.

{% highlight javascript %}
y.observe(function(events){
  for(i in events){
    console.log("The following event-type was thrown: "+events[i].type)
    console.log("The event was executed on: "+events[i].name)
    console.log("The event object has more information:")
    console.log(events[i])
  }
})
{% endhighlight %}


##### Tips:

* Sometimes you want your client to wait, until it is synchronized with all the other clients. Just call `connector.whenSynced(function(){console.log("synchronized")})`
* At all times, you can retrieve your shared document as a JSON object with `y.toJson()`

### Collaborative Text Area

When you collaborate on text, you should use the Word type, which handles mutable Strings (In general, Strings are not mutable in Javascript). The Word type has some convenient helpers, e.g. for binding it to an arbitrary input element. Try the following in your browser console.

{% highlight javascript %}
// create a mutable String/Word-Type
y.val("mutable_string", "content", "mutable");

// get the Word-Type
var mutable_string = y.val("mutable_string");

// get a textarea dom object
var textarea = document.querySelector("textarea");

// bind the mutable string to the textarea
mutable_string.bind(textarea)

console.log(mutable_string.val()) // => "content" - retrieve the current value

{% endhighlight %}

Now, the *mutable\_string* is bound to the *textarea*. This means that the *mutable\_string* is updated, when you type something in the *textarea*, and the *textarea* is updated when something is inserted into the *mutable\_string*

<textarea style="width: 100%;height:5em"> Please bind me :)</textarea>

### Polymer Elements

I want to make Yjs as easy as possible. When I [stumbled upon Polymer](https://plus.google.com/110297010634240861782/posts/FireNaHeDB6), I was amazed how it can be to create complex applications with just a few linew of code.

<!--div align="center">
<iframe width="560" style="max-width:100%" height="315" src="//www.youtube.com/embed/svfu9iQ8cyg" frameborder="0" allowfullscreen></iframe>
</div-->

Yjs as a *custom element* makes building collaborative applications _sooo_ easy. Just bind your shared values to the elements that you want to make collaborative.


{% highlight html %}
<link rel="import" href="/polymer/polymer.html">
<link rel="import" href="/y-connectors/y-xmpp/y-xmpp.html">
<link rel="import" href="/y/y-object.html">
<link rel="import" href="/paper-slider/paper-slider.html">
<link rel="import" href="/paper-radio-group/paper-radio-group.html">

{% raw %}
<polymer-element name="y-polymer-binding" attributes="y connector">
  <template>
    <!-- First, create a connector-->
    <xmpp-connector connector={{connector}}></xmpp-connector>

    <!-- Bind the connector to the y-object -->
    <y-object connector={{connector}} val={{y}}>
      <!-- The y-object exports an instance of Y (similar to that one we created with pure Javascript). -->
      <!-- We can access its properties with the y-property tag -->
      <y-property name="slider" val={{slider}}></y-property>
      <y-property name="radio" val={{radio}}></y-property>
    </y-object>

    <!-- Now, we can bind the properties to arbitrary custom elements -->
    <paper-radio-group selected={{radio}}>
      <paper-radio-button name="nice" label="Nice"></paper-radio-button>
      <paper-radio-button name="great" label="Great"></paper-radio-button>
      <paper-radio-button name="awesome" label="Awesome"></paper-radio-button>
    </paper-radio-group>
    <paper-slider min="0" max="200" immediateValue={{slider}}></paper-slider>
  </template>
  <script>
  Polymer({
  })
  </script>
</polymer-element>
{% endraw %}

{% endhighlight %}


<elements-showoff></elements-showoff>

Try to make the polymer elements above collaborative by putting the following code in your browser console:

{% highlight javascript %}

var custom_element = document.querySelector("elements-showoff");

// The elements-showoff tag expects an val attribute.
// Then, the elements-showoff element binds val to a y-object.
custom_element.val = y;

{% endhighlight %}

Manipulate the values of the *y* object, and observe the live changes of the custom element.

<hr>
What do **you** want to see next?


<script src="{{ site.baseurl }}bower_components/yjs/y.js"></script>
<script src="{{ site.baseurl }}bower_components/y-xmpp/y-xmpp.js"></script>
<script src="{{ site.baseurl }}bower_components/y-webrtc/y-webrtc.js"></script>
<link rel="import" href="{{ site.baseurl }}elements/elements-showoff.html">

<!--script>
var connector = new Y.XMPP().join("tutorial");
var y = new Y(connector);
connector.whenSynced(function(){
  if(y.val("shared_text") == null){
    y.val("shared_text","")
    y.val("slider",39)
  }
  var textarea = document.querySelector("#shared-text")
  y.val("shared_text").bind(textarea)
  var ce = document.querySelector("elements-showoff");
  ce.val = y
  // document.querySelector("y-object").val = y;
});
</script-->