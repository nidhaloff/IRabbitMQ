/*  09.04.2019
    author : Nidhal Baccouri
    goal: Implement an Interface to make the communication with RabbitMQ easier and abstracter than the Implementation of amqplib which is the Library that implements the AMQP Protocol (to download you can use npm install amqplib)
    Problems: // just writing this because maybe in the Future some Features will be added to Javascript/Node js and then we can make some changes to make the Implementation better and to understand why i had to implement it this way in the first place 
    1-since i couldnt use shared factory functions or nested classes in JS because it is simply not a feature of JS (at least for the moment), it is harder to wrap those functions in one Class and share Properties of it so that's one of the Problems i faced
    2-Node js is made to be asynchronous so it ll be very Complex to try making it synchronous. there is some Implementation for working with files etc.. but in this case of forcing amqp Library to work synchronously i wasnt able to find something useful. Maybe in the Future or if someone in the Team have an Idea :)
    3-The class will contain only functions and no nested classes and we ll have to create an instance of it in an asynchronous way so that we can use the goody functions, that can be a pain but for the Moment it's the only way to do it (at least that's what i think)
    
    fixed Problems:
    - 3rd Problem fixed =>  an instance of the class will be exported direct so that we dont have to create it ourselves and that will make it easier to use and read

*/


const rabbitMQServer = 'amqp://evallx033.emea.porsche.biz:5672'; 
const amqplib = require('./node_modules/amqplib'); // amqplib is the Bibliothek that implement the AMQP Protocol
const uuid = require('./node_modules/uuid/v4'); // lightweight library to generate a uuid 
const _ = require('./node_modules/lodash'); // Library with Some useful functions to validate Types
const validateHost = require('./node_modules/is-url'); // library to validate host/url types

class IRabbitMQ {

    constructor() {

      this.ready = this.init(rabbitMQServer);
      
    }

    // close connection with rabbitmq
    closeConnection(connection = this.connection) {

        connection.closeConnection();
    }
  
    // initialize Connection and open Channel with rabbitmq
    async init(host) {

        //#region  parameter Description:
        /* 
            -host : this refer to the rabbitMQ Server that we want to connect to
        */
       //#endregion
      
       if (!validateHost(host)) {

            throw new Error('Invalid Host Format of RabbitMQ');
       }

       try {

        const connection = await amqplib.connect(host);

        const channel = await connection.createChannel();

        channel.prefetch(1);

        console.log(' [x] Awaiting RPC requests');

        this.connection = connection; 
  
        this.channel = channel;
      } 

      catch (err) {

        console.error(err);

      }
    }
    
    // basic function sender => this will send a Message direct to a queue (there is no exchange middleware), queue options will describe if the queue will be durable, exclusive etc.. it is set to a default value
    async sender(queue, message, qOptions = {durable : false}) {
        //#region  parameter Description:
        /* 
            -queue : the queue we want to sent the message to
            -message : message we want to send
            -qOptions : Options of the queue set to default value : durable = false (if true the queue will survive broker restart)
        */
       //#endregion
      
       await this.channel.assertQueue(queue, qOptions);

      this.channel.sendToQueue(queue, Buffer.from(message));

      console.log("msg sent ");
    }

    // basic function receiver => this will receive a Message from a queue (there is no exchange middleware) based on queue name. queue options will describe if the queue will be durable, exclusive etc.. it is set to a default value
    async receiver(queue, qOptions = {durable: false}, ack_options = {noAck : true} ) {
         //#region  parameter Description:
         /*
            -queue : the queue we want to receive the message from it
            -qOptions : Options of the queue set to default value : durable = false (if true the queue will survive broker restart)
            -ack_options are the acknowledge options, if we want to acknowledge the message that property noAck should set to false 
         */
         //#endregion
       
         await this.channel.assertQueue(queue, qOptions);

        await this.channel.consume(queue, function (msg) {

        console.log(" [x] Received %s", msg.content.toString());

      }, ack_options);
    }

    // Consume a Request from a Client, make some Processing and then return a Response based on that (this function Implements the RPC Pattern)
    async rpcServer(serverName, routingKey, consumeQueue='test_queue', response, channel = this.channel, qOptions= {exclusive : false}, ack_options = {noAck : true}) {
          //#region  parameter Description:
        /* 
            -publisherName : Name from the Publisher that send the Request to this Server => this Parameter is used to declare the Queue that we want to subscribe to it so that we can consume the Request from it
            -channel : TCP channel we want to use => default value is this channel of the Class IRabbitMQ but another channel can be used instead 
            -qOptions : Options of the queue set to default value : : if true, scopes the queue to the connection (defaults to false)
            -ack_options are the acknowledge options, if we want to acknowledge the message that property noAck should set to false 
        */
       //#endregion
        let ex = serverName + 'rpc';
     
        channel.assertExchange(ex, 'direct', {durable : true});

        let q = await channel.assertQueue(consumeQueue, qOptions); // Declare a Queue with that queueName and some Options
        channel.bindQueue(q.queue, ex, routingKey);

        await channel.consume(q.queue, msg=> { // consume msg from that exchange according to some Parameters 
        
            console.log("string msg", msg.content.toString());

            channel.sendToQueue(msg.properties.replyTo, Buffer.from(response), {correlationId: msg.properties.correlationId});
                    
            //channel.ack(msg); // if we want to acknowledge the messages than we must uncomment this

            }, ack_options);
       
    }

    // Send a Request to an RPC Server and wait for a Response => rpcClient and rpcServer implements the rpc pattern of rabbitmq 
    async rpcClient(clientName, routingKey, request, replyToQueue = '', channel = this.channel, connection = this.connection, qOptions= {exclusive : false},  ack_options = {noAck : true}) {
        //#region  parameter Description:
        /* 
            -publisherName : Name from the Publisher that will make the Request
            -destinationQueue : this is the Queue that we want to send our Request to it and it is the same Queue that an RPC_Server should subscribe to it to consume this Request
            -request : current Request we want to send
            -corr : correlation ID => default value is set to uuid from the library based on Time
            -replyToQueue : this Queue will be sent along with the Request so that the Server can send the Response to it and then that Response can be received by the Client based on that Queue => default value set to this 'publisherName_queue'
            -channel : TCP channel we want to use => default value is this channel of the Class IRabbitMQ but another channel can be used instead 
            -connection : Connection we want to use => default value is this connection of the class IRabbitMQ but another connection can be used instead
            -qOptions : Options of the queue set to default value : : if true, scopes the queue to the connection (defaults to false)
            -ack_options are the acknowledge options, if we want to acknowledge the message that property noAck should set to false 
        */
       //#endregion

       let corr = uuid();
       let ex = clientName + 'rpc';
      
       channel.assertExchange(ex, 'direct', {durable : true});

        let q = await channel.assertQueue(replyToQueue, qOptions);
        channel.publish(ex, routingKey, Buffer.from( JSON.stringify(request) ), { correlationId: corr, replyTo: q.queue });

        console.log(' [x] Requesting response for this msg', request);

        channel.consume(q.queue, msg => {

            if(msg.properties.correlationId == corr) {

                console.log(' [.] Got %s', msg.content.toString());
               setTimeout(function() { connection.close(); process.exit(0) }, 500);
            }
        }, ack_options);

    }

    // publish a Message to an Exchange based on routing Key 
    async eventPublisher(publisherName, routingKey, message, exchangeName= publisherName+'_events', exchangeType = 'direct', connection = this.connection, channel = this.channel) {
        //#region  parameter Description:
        /* 
            -publisherName : Name of the Publisher
            -routing Key : based on this key will the messages be delivered
            -message : the message we want to send
            -exchangeName : name of the exchange => default value set to the publisherName+'_events'
            -exchangeType : type of exchange => default set to direct 
            -connection
            -channel
        */
       //#endregion
        
     

        if(!connection) {
                
                throw new Error('you need to create an Instance ')
            }

        channel.assertExchange(exchangeName, exchangeType);

        channel.publish(exchangeName, routingKey, Buffer.from(JSON.stringify(message)));
    }

    // Subscribe to a Publisher to consume Messages based on routing KEy 
    async eventSubscriber(subscriberName, routingKey, _eventListener = this._eventListener, exchangeName = subscriberName+'_events', queueName = subscriberName+'_events', exchangeType = 'direct', qOptions= {exclusive : false, durable: true}, ack_options = {noAck : true}, channel = this.channel, connection = this.connection ) {

           //#region  parameter Description:
        /* 
            -subscriberName : Name of the Subscriber 
            -routing Key : based on this key will the messages be delivered
            -eventListener : event that will be fired when the message is consumed
            -exchangeName : name of the exchange => default value set to the subscriberName+'_events'
            -queueName : the queue that we ll consume our message from
            -exchangeType : type of exchange => default set to direct 
            -qOptions : options of the queue => set to default 
            -ack_options : acknowledgment options => set to default
            -connection
            -channel
        */
       //#endregion

        let eventListener = _eventListener;

        if(!connection) {
            
            throw new Error('you need to create an Instance ')
        }

        channel.assertExchange(exchangeName, exchangeType)

        let q = await channel.assertQueue(queueName, qOptions);

        let subscribeQueue = q.queue;

        channel.bindQueue(subscribeQueue, exchangeName, routingKey);

        await channel.consume(subscribeQueue, msg => {

            eventListener(msg);

        }, ack_options);
    }

    // this function will be fired as an Event when a Subscriber received a Message from a Publisher
    _eventListener(msg){

        // do Something when the subscriber receive the message from the Publisher
        // example:
            console.log("Message %s received from Publisher", msg.content.toString());
        
    }

    // a taskExecuter function responsible of executing tasks => it can consume tasks and choose to raise an Event, send a Response or both
    async taskResponse(executerName, routingKey, consumeQueue, response, _responseListener = this._responseListener, _sendReturn = this.sendReturn, channel = this.channel, qOptions= {exclusive : false}, ack_options = {noAck : true}) {
       
        //#region  parameter Description:
        /* 
            -executerName : Name of the Executer of the Task
            -routing Key : based on this key will the messages be delivered
            -consumeQueue : create this Queue and bind it with Exchange on purpose of consuming the Request of the Client
            -response : response to send back to the Requester
            -taskListener : event that will be fired when the Request is consumed => default set to the responseListener function of this Class
            - channel : default set to this channel of the class IRabbitMQ
            -qOptions : options of the queue => set to default 
            -ack_options : acknowledgment options => set to default
          
        */
       //#endregion
       
       //#region Format of Parameters Description
        if(!_.isString(executerName))  throw new Error('executer Name should be a String Type');
        if(!_.isString(routingKey))  throw new Error('routingKey should be a String Type');   
        if(!_.isString(consumeQueue))  throw new Error('consumeQueue should be a String Type'); 
        if(!_.isFunction(_responseListener))  throw new Error('response Listener must be a Function'); 
        if(!_.isFunction(_sendReturn))  throw new Error('send Return must be a Function'); 
        if(!_.isObjectLike(qOptions))  throw new Error('queue Options must be wrapped in an Object'); 
        if(!_.isObjectLike(ack_options))  throw new Error('acknowledgments Options must be wrapped in an Object'); 
        //#endregion
      
        let ex = executerName + '_tasks';
        
        let responseListener = _responseListener;

        let returnResponseToRequester = _sendReturn;

        let res = response;

        channel.assertExchange(ex, 'direct', {durable : true});

        let q = await channel.assertQueue(consumeQueue, qOptions); // Declare a Queue with that queueName and some Options

        channel.bindQueue(q.queue, ex, routingKey);

        await channel.consume(q.queue, msg=> { // consume msg from that exchange according to some Parameters 
        
            responseListener();

            returnResponseToRequester(channel, msg, res);

            }, ack_options);
     
    }

    // this function will be fired as Event when a taskExecuter will consume a Request => define your own function before calling taskResponse and passing this function as an argument
    _responseListener() {
 
        console.log("msg received and a response Event can be fired");
    
    }

    // send the result of the Task aka the Response back to taskRequester => this function is used to return a response to a TaskRequester, define your own function before calling taskResponse and passing this function as an argument
    sendReturn(channel, msg, response){

        //#region  parameter Description:
        /* 
            -channel : channel used to communication purposes
            -msg : msg consumed 
            -response : response we want to send back to the Requester
        */
       //#endregion
     
        //#region Format of Parameters Description
        if(!_.isObject(response) && !_.isString(response))  throw new Error('response should be a String, Object or JSON Format');
        //#endregion
       
        channel.sendToQueue(msg.properties.replyTo, Buffer.from(JSON.stringify(response)), {correlationId: msg.properties.correlationId});
                
        //channel.ack(msg); // if we want to acknowledge the messages than we must uncomment this

    }

  // Send a Request to an RPC Server and wait for a Response
    async taskRequest(executerName, routingKey, request, _requestListener = this._requestListener, replyToQueue = '', channel = this.channel, connection = this.connection, qOptions= {exclusive : false},  ack_options = {noAck : true}) {
           
        //#region  parameter Description:
        /* 
            -executerName : Name of the Executer of the Task
            -routing Key : based on this key will the messages be delivered
            -request : actual Request of the Client
           
            -requestListener : event that will be fired when the Response is consumed => default set to the requestListener function of this Class
            -replyToQueue : Queue that we will define as a property of replyTo, purpose of this Queue is that the Response of the taskExecuter will be send to this particular Queue => default set to empty string that means that RabbitMQ will generate a random Queue for us
            - channel : default set to this channel of the class IRabbitMQ
            -qOptions : options of the queue => set to default 
            -ack_options : acknowledgment options => set to default
          
        */
       //#endregion

       //#region Format of Parameters Description
       if(!_.isString(executerName))  throw new Error('executer Name should be a String Type');
       if(!_.isString(routingKey))  throw new Error('routingKey should be a String Type');   
       if(!_.isString(request) && !_.isObject(request))  throw new Error('request should be a String, Object or JSON Format'); 
       if(!_.isFunction(_requestListener))  throw new Error('_requestListener must be a Function'); 
       if(!_.isString(replyToQueue))  throw new Error('replyToQueue must be a String Type'); 
       if(!_.isObjectLike(qOptions))  throw new Error('queue Options must be wrapped in an Object'); 
       if(!_.isObjectLike(ack_options))  throw new Error('acknowledgments Options must be wrapped in an Object'); 
       //#endregion
        
        let corr = uuid();
       // console.log(this.isUUID(corr));

        let requestListener = _requestListener;

        let ex = executerName + '_tasks';
        
        channel.assertExchange(ex, 'direct', {durable : true});

        let q = await channel.assertQueue(replyToQueue, qOptions);

        channel.publish(ex, routingKey, Buffer.from( JSON.stringify(request)), { correlationId: corr, replyTo: q.queue });

        console.log(' [x] Requesting response for this msg', request);

        channel.consume(q.queue, msg => {

            requestListener(msg, corr);

        }, ack_options);
    }

    // this function will be fired as Event when a Task Client will receive the Response of his Request => define your own function before calling taskRequest and passing this function as an argument
    _requestListener(msg, corr) {
             
        //#region  parameter Description:
        /* 
            -msg : msg here represent the Response of the TaskExecuter (taskResponser) 
            -corr : corr is the correlationID that was Sent with the Request => that means corr and correlationID of the msg should match so that the msg can be consumed successfully
        */
       //#endregion
        
       
       if(msg.properties.correlationId == corr) {

            console.log(' [.] Got %s success', msg.content.toString());
           //setTimeout(function() { connection.close(); process.exit(0) }, 500);
        }
    }

    // function to check if the correlation ID passed as an argument is of type uuid
    isUUID ( uuid ) {
        let s = "" + uuid;
    
        s = s.match('^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$');
        if (s === null) {
          return false;
        }
        return true;
    }

  }

  
module.exports = new IRabbitMQ(); // Export the Module so that we can use it in other files









