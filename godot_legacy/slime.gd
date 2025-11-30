extends CharacterBody2D # Nebo Node2D, podle toho co jsi zvolil

@onready var sprite = $AnimatedSprite2D

func dostal_zasah():
	print("Au! To bolelo!")
	
	# Změníme barvu na červenou (jako že krvácí/blikne)
	modulate = Color.RED
	
	# Počkáme 0.2 sekundy (aby si hráč všiml červené)
	var timer = get_tree().create_timer(0.2)
	await timer.timeout
	
	# Vrátíme barvu zpět (nebo ho smažeme, pokud umřel)
	modulate = Color.WHITE
	
	# Pokud chceš, aby rovnou umřel, odkomentuj tento řádek:
	# queue_free()
